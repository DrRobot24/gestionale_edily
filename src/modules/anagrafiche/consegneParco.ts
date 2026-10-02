import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'
import type { TipoParco } from './parco'

/* ══════════════════════════════════════════════════════════════════
   A CHI E' CONSEGNATO UN MEZZO O UN'ATTREZZATURA. Dal 2026-10-02.

   «Voglio poter segnare a chi e' stata consegnata l'attrezzatura o il
   mezzo (dall'anagrafica ovviamente devo prendere il dato)» (utente).

   Una riga per consegna, con la persona presa da `dipendenti`: dal, e
   quando torna, al. Quella senza restituzione dice chi ce l'ha adesso;
   le altre sono lo storico. Una persona alla volta: il database rifiuta
   la seconda consegna aperta. Tabella e policy in
   `supabase/schema/parco-consegne-carburante.sql` — come le spese, le
   vede e le scrive chi ha `anagrafiche.write`.
   ══════════════════════════════════════════════════════════════════ */

export type Consegna = {
  id: string
  dipendente_id: string
  consegnato_il: string
  restituito_il: string | null
  note: string | null
  dipendente: { cognome: string; nome: string } | null
}

/** La colonna che punta alla cosa: una per tipo. */
const COLONNA: Record<TipoParco, 'mezzo_id' | 'attrezzatura_id'> = {
  mezzi: 'mezzo_id',
  attrezzature: 'attrezzatura_id',
}

/** «Rossi Mario», come negli altri elenchi. */
export function nominativo(d: { cognome: string; nome: string } | null): string {
  return d ? `${d.cognome} ${d.nome}` : 'Persona rimossa'
}

/** La tabella non c'e' ancora: lo SQL non e' stato eseguito. */
export function consegneMancanti(e: unknown): boolean {
  const c = (e as { code?: string } | null)?.code
  return c === '42P01' || c === 'PGRST205'
}

/** Gli errori del database detti con le parole di chi li incontra. */
function spiega(e: { code?: string; message: string }): Error {
  if (consegneMancanti(e)) {
    return new Error(
      'Manca la tabella nel database: va eseguito supabase/schema/parco-consegne-carburante.sql.',
    )
  }
  if (e.code === '23505') {
    return new Error('È già consegnato a qualcuno: segna prima la restituzione.')
  }
  if (e.code === '23514') {
    return new Error('La restituzione non può essere prima della consegna.')
  }
  return new Error(e.message)
}

/** Tutte le consegne di una cosa, dalla piu' recente. */
export function useConsegneParco(tipo: TipoParco, id: string | undefined) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['consegne-parco', tipo, id, org?.id],
    enabled: Boolean(id && org?.id),
    retry: false,
    queryFn: async (): Promise<Consegna[]> => {
      const { data, error } = await supabase
        .from('parco_consegne')
        .select('id, dipendente_id, consegnato_il, restituito_il, note, dipendente:dipendenti(cognome, nome)')
        .eq('org_id', org!.id)
        .eq(COLONNA[tipo], id!)
        .order('consegnato_il', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw spiega(error)
      return (data ?? []) as unknown as Consegna[]
    },
  })
}

/** Chi ha adesso ogni cosa di un tipo: per la colonna dell'elenco. */
export function useConsegneAperte(tipo: TipoParco, abilitato: boolean) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['consegne-parco', tipo, 'aperte', org?.id],
    enabled: Boolean(org?.id) && abilitato,
    retry: false,
    queryFn: async (): Promise<Map<string, Consegna>> => {
      const { data, error } = await supabase
        .from('parco_consegne')
        .select(
          'id, mezzo_id, attrezzatura_id, dipendente_id, consegnato_il, restituito_il, note, dipendente:dipendenti(cognome, nome)',
        )
        .eq('org_id', org!.id)
        .is('restituito_il', null)
        .not(COLONNA[tipo], 'is', null)
      if (error) {
        // Lo SQL non eseguito: nessuna consegna, non un guasto.
        if (consegneMancanti(error)) return new Map()
        throw error
      }
      const righe = (data ?? []) as unknown as (Consegna & Record<string, string | null>)[]
      return new Map(righe.map((r) => [r[COLONNA[tipo]] as string, r]))
    },
  })
}

export function useConsegna(tipo: TipoParco, voceId: string) {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (d: { dipendente_id: string; consegnato_il: string; note: string | null }) => {
      const { error } = await supabase
        .from('parco_consegne')
        .insert({ ...d, org_id: org!.id, [COLONNA[tipo]]: voceId })
      if (error) throw spiega(error)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consegne-parco', tipo] }),
  })
}

export function useRestituisci(tipo: TipoParco) {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, restituito_il }: { id: string; restituito_il: string }) => {
      const { error } = await supabase
        .from('parco_consegne')
        .update({ restituito_il })
        .eq('id', id)
        .eq('org_id', org!.id)
      if (error) throw spiega(error)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consegne-parco', tipo] }),
  })
}

/** Solo per le consegne segnate per sbaglio: quelle vere si chiudono
 *  con la restituzione, e restano nello storico. */
export function useEliminaConsegna(tipo: TipoParco) {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('parco_consegne')
        .delete()
        .eq('id', id)
        .eq('org_id', org!.id)
      if (error) throw spiega(error)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consegne-parco', tipo] }),
  })
}
