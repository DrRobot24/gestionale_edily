import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'

/* ══════════════════════════════════════════════════════════════════
   Le assenze a giornata intera: persona, giorno, motivo.

   Nascono il 2026-09-23 da `supabase/schema/assenze.sql`. Prima
   l'assenza si scriveva dentro il rapportino di un cantiere, e chi era
   in ferie risultava su un cantiere dove non aveva messo piede.

   LE SCRIVE IL TECNICO, nella sua giornata, prima dell'invio. Se e' lui
   a mancare, qualcuno compila con la sua utenza: non c'e' un secondo
   flusso per l'amministrazione.

   La regola «assente = su nessun rapportino» la tiene il database con
   due trigger. Qui si anticipa soltanto, per non far scegliere in
   squadra chi e' gia' segnato assente.
   ══════════════════════════════════════════════════════════════════ */

export type Assenza = {
  id: string
  dipendente_id: string
  data: string
  motivo: string
  nota: string | null
  /** Il nome, per chi guarda le assenze senza avere l'anagrafica sotto
   *  mano: il titolare nel riquadro delle giornate da validare. */
  dipendenti: { cognome: string; nome: string } | null
}

export type DatiAssenza = {
  dipendente_id: string
  motivo: string
  nota: string | null
}

/** Le assenze di un giorno, per persona. Sotto `['rapportini']`: segnare
 *  un assente cambia cio' che l'invio accetta, e il pulsante deve
 *  saperlo senza ricaricare. */
export function useAssenze(giorno: string | undefined) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['rapportini', 'assenze', org?.id, giorno],
    enabled: Boolean(org?.id && giorno),
    retry: false,
    queryFn: async (): Promise<Map<string, Assenza>> => {
      const { data, error } = await supabase
        .from('assenze')
        .select('id, dipendente_id, data, motivo, nota, dipendenti ( cognome, nome )')
        .eq('org_id', org!.id)
        .eq('data', giorno!)
      if (error) throw error

      const per = new Map<string, Assenza>()
      for (const a of data ?? []) per.set(a.dipendente_id, a)
      return per
    },
  })
}

export function useSegnaAssenza(giorno: string) {
  const { org, app } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (dati: DatiAssenza) => {
      /* `upsert` sulla coppia persona-giorno: cambiare il motivo di
         un'assenza gia' scritta la corregge, invece di rifiutarsi. */
      const { error } = await supabase.from('assenze').upsert(
        {
          ...dati,
          data: giorno,
          org_id: org!.id,
          scritta_da: app!.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'dipendente_id,data' },
      )
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rapportini'] }),
  })
}

export function useTogliAssenza(giorno: string) {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (dipendenteId: string) => {
      const { error } = await supabase
        .from('assenze')
        .delete()
        .eq('org_id', org!.id)
        .eq('dipendente_id', dipendenteId)
        .eq('data', giorno)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rapportini'] }),
  })
}
