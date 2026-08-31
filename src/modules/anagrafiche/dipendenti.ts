import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'

/* ══════════════════════════════════════════════════════════════════
   Dipendenti + tariffe storicizzate.

   `dipendente_costi` non e' un campo del dipendente: e' una serie
   temporale con `valido_dal`. Randazzo costa 28,50 €/h DAL 1 gennaio.
   Quando cambia il CCNL non si sovrascrive, si aggiunge una riga — cosi'
   un rapportino di gennaio continua a costare la tariffa di gennaio
   anche se lo si rilegge a dicembre. E' l'unico modo perche' un
   consuntivo resti vero nel tempo.
   ══════════════════════════════════════════════════════════════════ */

const CAMPI =
  'id, matricola, nome, cognome, codice_fiscale, mansione, livello_ccnl, tipo_contratto, ' +
  'data_assunzione, data_cessazione, telefono, email, attivo, user_id'

const CAMPI_CON_COSTI = `${CAMPI}, dipendente_costi ( id, valido_dal, costo_orario, costo_orario_straordinario, tariffa_vendita_oraria, note )`

type Tariffa = {
  id: string
  valido_dal: string
  costo_orario: number
  costo_orario_straordinario: number | null
  tariffa_vendita_oraria: number | null
  note: string | null
}

/**
 * La tariffa in vigore a una certa data: l'ultima che comincia entro
 * quella data. Non basta prendere la piu' recente in assoluto, perche'
 * si possono inserire in anticipo le tariffe del prossimo anno.
 */
export function tariffaVigente(tariffe: Tariffa[] | null, aData = new Date().toLocaleDateString('sv-SE')) {
  if (!tariffe?.length) return null
  return (
    tariffe
      .filter((t) => t.valido_dal <= aData)
      .sort((a, b) => b.valido_dal.localeCompare(a.valido_dal))[0] ?? null
  )
}

export function useDipendenti({ soloAttivi = true } = {}) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['dipendenti', org?.id, soloAttivi],
    enabled: Boolean(org?.id),
    queryFn: async () => {
      let q = supabase.from('dipendenti').select(CAMPI_CON_COSTI).eq('org_id', org!.id)
      if (soloAttivi) q = q.eq('attivo', true)

      const { data, error } = await q.order('cognome')
      if (error) throw error
      return data
    },
  })
}

export function useDipendente(id: string | undefined) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['dipendente', id],
    enabled: Boolean(id && org?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dipendenti')
        .select(CAMPI_CON_COSTI)
        .eq('id', id!)
        .eq('org_id', org!.id)
        .single()
      if (error) throw error
      return data
    },
  })
}

export type DatiDipendente = {
  matricola: string | null
  nome: string
  cognome: string
  codice_fiscale: string | null
  mansione: string | null
  livello_ccnl: string | null
  tipo_contratto: string | null
  data_assunzione: string | null
  data_cessazione: string | null
  telefono: string | null
  email: string | null
}

/** Un solo hook per creare e per modificare: il chiamante passa l'id
 *  oppure no. Due hook quasi identici divergono al primo campo nuovo. */
export function useSalvaDipendente() {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, dati }: { id?: string; dati: DatiDipendente }) => {
      if (id) {
        const { error } = await supabase
          .from('dipendenti')
          .update(dati)
          .eq('id', id)
          .eq('org_id', org!.id)
        if (error) throw error
        return id
      }

      const { data, error } = await supabase
        .from('dipendenti')
        .insert({ ...dati, org_id: org!.id })
        .select('id')
        .single()
      if (error) throw error
      return data.id
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['dipendenti'] })
      qc.invalidateQueries({ queryKey: ['dipendente', id] })
    },
  })
}

export function useAggiungiTariffa() {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (t: {
      dipendente_id: string
      valido_dal: string
      costo_orario: number
      costo_orario_straordinario: number | null
      tariffa_vendita_oraria: number | null
      note: string | null
    }) => {
      const { error } = await supabase.from('dipendente_costi').insert({ ...t, org_id: org!.id })
      if (error) throw error
    },
    onSuccess: (_, t) => {
      qc.invalidateQueries({ queryKey: ['dipendenti'] })
      qc.invalidateQueries({ queryKey: ['dipendente', t.dipendente_id] })
    },
  })
}

export function useArchiviaDipendente() {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, attivo }: { id: string; attivo: boolean }) => {
      const { error } = await supabase
        .from('dipendenti')
        .update({ attivo })
        .eq('id', id)
        .eq('org_id', org!.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dipendenti'] }),
  })
}

/**
 * Cancellazione vera, per il caso "l'ho appena inserito con un refuso".
 *
 * Se il dipendente ha gia' delle ore su un rapportino, Postgres rifiuta
 * con 23503 (violazione di chiave esterna) e noi lo traduciamo in una
 * frase leggibile invece di un codice. Non forziamo mai la mano: un
 * operaio con tre anni di rapportini si ARCHIVIA, non si cancella —
 * cancellarlo vorrebbe dire buttare via pezzi di storia contabile.
 */
export function useEliminaDipendente() {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('dipendenti')
        .delete()
        .eq('id', id)
        .eq('org_id', org!.id)

      if (error) {
        if (error.code === '23503') {
          throw new Error(
            'Questo dipendente ha già delle ore registrate sui rapportini, quindi non può essere eliminato senza perderne la storia. Archivialo invece: sparisce dagli elenchi ma i documenti restano corretti.',
          )
        }
        throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dipendenti'] }),
  })
}
