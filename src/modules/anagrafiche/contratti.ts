import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'

/* ══════════════════════════════════════════════════════════════════
   I CONTRATTI di una risorsa, e COME FINISCE IL SERVIZIO. Dal
   2026-09-29.

   «Possono essere oltre che di diversa tipologia anche di diversa
   azienda» (utente): un determinato rinnovato, trasformato in
   indeterminato, rifatto con un'altra ditta del gruppo. Ogni contratto
   e' una riga, e i vecchi restano. Un contratto nuovo chiude da solo
   quello aperto, il giorno prima: lo fa il database.

   Il contratto sta DENTRO il servizio e puo' finire prima: la persona
   resta in servizio. Il contrario no — finito il servizio, i contratti
   aperti si chiudono a quella data.

   Tabelle chiuse su `anagrafiche.write`, lettura compresa: il perche'
   sta in `supabase/schema/risorse-contratti.sql`.
   ══════════════════════════════════════════════════════════════════ */

export const CONTRATTI = ['Tempo indeterminato', 'Tempo determinato', 'Apprendistato', 'Stagionale']

/** I contratti che nascono con una data di fine: la si chiede subito. */
export const A_TERMINE = new Set(['Tempo determinato', 'Stagionale'])

export type MotivoFine =
  | 'scadenza_termine'
  | 'dimissioni'
  | 'licenziamento'
  | 'prova_non_superata'
  | 'risoluzione_consensuale'
  | 'pensionamento'
  | 'nuovo_contratto'
  | 'fine_servizio'
  | 'altro'

export const ETICHETTA_MOTIVO: Record<MotivoFine, string> = {
  scadenza_termine: 'Scadenza del termine',
  dimissioni: 'Dimissioni',
  licenziamento: 'Licenziamento',
  prova_non_superata: 'Prova non superata',
  risoluzione_consensuale: 'Risoluzione consensuale',
  pensionamento: 'Pensionamento',
  nuovo_contratto: 'Sostituito da un nuovo contratto',
  fine_servizio: 'Fine del servizio',
  altro: 'Altro',
}

/** Quelli che si scelgono a mano. «Nuovo contratto» e «fine del
 *  servizio» li scrive il database, quando succedono. */
export const MOTIVI_SCELTI: MotivoFine[] = [
  'scadenza_termine',
  'dimissioni',
  'licenziamento',
  'prova_non_superata',
  'risoluzione_consensuale',
  'pensionamento',
  'altro',
]

export type Contratto = {
  id: string
  dipendente_id: string
  azienda: string
  tipo_contratto: string | null
  dal: string
  al: string | null
  motivo_fine: MotivoFine | null
  note_fine: string | null
}

export type Uscita = {
  dipendente_id: string
  motivo: MotivoFine
  note: string | null
}

const oggi = () => new Date().toLocaleDateString('sv-SE')

/** Aperto = senza fine, o con la fine non ancora passata. Comprende
 *  quello che comincia fra qualche giorno: e' gia' firmato. */
export function aperto(c: Contratto, giorno: string = oggi()): boolean {
  return !c.al || c.al >= giorno
}

/** Lo SQL non eseguito: nessun contratto, non un guasto. */
function tabellaMancante(e: unknown): boolean {
  const c = (e as { code?: string } | null)?.code
  return c === '42P01' || c === 'PGRST205'
}

const MANCA_SQL = 'Manca la tabella nel database: va eseguito supabase/schema/risorse-contratti.sql.'

/** I messaggi del database sono gia' frasi (vedi i `raise` nel file
 *  SQL): si passano cosi' come sono. */
function errore(e: { code?: string; message: string }): Error {
  if (tabellaMancante(e)) return new Error(MANCA_SQL)
  return new Error(e.message)
}

/** Tutti i contratti dell'azienda, dal piu' recente: sono poche righe, e
 *  la lista delle Risorse ne ha bisogno tutti insieme. */
export function useContratti({ abilitato }: { abilitato: boolean }) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['contratti', org?.id],
    enabled: Boolean(org?.id) && abilitato,
    retry: false,
    queryFn: async (): Promise<Contratto[]> => {
      const { data, error } = await supabase
        .from('dipendente_contratti')
        .select('id, dipendente_id, azienda, tipo_contratto, dal, al, motivo_fine, note_fine')
        .eq('org_id', org!.id)
        .order('dal', { ascending: false })
      if (error) {
        if (tabellaMancante(error)) return []
        throw error
      }
      return (data ?? []) as Contratto[]
    },
  })
}

/** Scrivere un contratto cambia anche la scheda: il database ne ricopia
 *  data, ditta e stato su `dipendenti`. */
function useInvalida() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['contratti'] })
    qc.invalidateQueries({ queryKey: ['dipendenti'] })
    qc.invalidateQueries({ queryKey: ['dipendente'] })
  }
}

export function useAggiungiContratto() {
  const { org } = useSession()
  const invalida = useInvalida()

  return useMutation({
    mutationFn: async (c: Omit<Contratto, 'id'>) => {
      const { error } = await supabase
        .from('dipendente_contratti')
        .insert({ ...c, org_id: org!.id })
      if (error) throw errore(error)
    },
    onSuccess: invalida,
  })
}

/** Cambia la fine di un contratto: chiuderlo, spostarne la scadenza,
 *  riaprirlo (fine e motivo a null). */
export function useFineContratto() {
  const { org } = useSession()
  const invalida = useInvalida()

  return useMutation({
    mutationFn: async ({
      id,
      al,
      motivo_fine,
      note_fine,
    }: Pick<Contratto, 'id' | 'al' | 'motivo_fine' | 'note_fine'>) => {
      const { data, error } = await supabase
        .from('dipendente_contratti')
        .update({ al, motivo_fine, note_fine })
        .eq('id', id)
        .eq('org_id', org!.id)
        .select('id')
      if (error) throw errore(error)
      if (!data?.length) throw new Error('Non hai il permesso di modificare questo contratto.')
    },
    onSuccess: invalida,
  })
}

export function useEliminaContratto() {
  const { org } = useSession()
  const invalida = useInvalida()

  return useMutation({
    mutationFn: async (id: string) => {
      // Una DELETE respinta dalla RLS tocca zero righe senza errore.
      const { data, error } = await supabase
        .from('dipendente_contratti')
        .delete()
        .eq('id', id)
        .eq('org_id', org!.id)
        .select('id')
      if (error) throw errore(error)
      if (!data?.length) throw new Error('Non hai il permesso di cancellare questo contratto.')
    },
    onSuccess: invalida,
  })
}

/* ── come finisce il servizio ── */

export function useUscita(dipendenteId: string | undefined, abilitato: boolean) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['uscita', dipendenteId],
    enabled: Boolean(org?.id && dipendenteId) && abilitato,
    retry: false,
    queryFn: async (): Promise<Uscita | null> => {
      const { data, error } = await supabase
        .from('dipendente_uscite')
        .select('dipendente_id, motivo, note')
        .eq('dipendente_id', dipendenteId!)
        .eq('org_id', org!.id)
        .maybeSingle()
      if (error) {
        if (tabellaMancante(error)) return null
        throw error
      }
      return data as Uscita | null
    },
  })
}

/** Scrive il motivo, o lo toglie quando `motivo` e' null. Si chiama
 *  DOPO aver salvato la scheda: la data di fine sta li'. */
export async function salvaUscita(
  orgId: string,
  dipendenteId: string,
  u: { motivo: MotivoFine; note: string | null } | null,
) {
  if (!u) {
    const { error } = await supabase
      .from('dipendente_uscite')
      .delete()
      .eq('dipendente_id', dipendenteId)
      .eq('org_id', orgId)
    if (error && !tabellaMancante(error)) throw error
    return
  }
  const { error } = await supabase
    .from('dipendente_uscite')
    .upsert({ dipendente_id: dipendenteId, org_id: orgId, motivo: u.motivo, note: u.note })
  if (error) throw errore(error)
}
