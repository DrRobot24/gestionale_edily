import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'

/* ══════════════════════════════════════════════════════════════════
   I clienti di un cantiere OLTRE al principale.

   Chiesto dall'utente il 2026-09-24: un cantiere puo' avere due o piu'
   clienti di riferimento, privati o aziende. Il principale resta in
   `cantieri.cliente_id` — lo legge anche wbs-office — e si sceglie nel
   modulo del cantiere; gli altri stanno in `cantiere_clienti`. Lo
   schema e il perche' in `supabase/schema/cantiere-clienti.sql`.

   Scrive chi ha `cantieri.write` (Stefania e il titolare), e lo decide
   la RLS: il frontend nasconde i pulsanti, non protegge niente. Il
   database controlla anche che cantiere e cliente siano della stessa
   azienda e che il cliente in piu' non sia gia' il principale.
   ══════════════════════════════════════════════════════════════════ */

export function useClientiCantiere(cantiereId: string | undefined) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['cantiere-clienti', cantiereId],
    enabled: Boolean(cantiereId && org?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cantiere_clienti')
        .select('id, cliente_id, clienti ( ragione_sociale, telefono, attivo )')
        .eq('cantiere_id', cantiereId!)
        .eq('org_id', org!.id)
        .order('created_at')
      if (error) throw error
      return data.map((r) => {
        const k = Array.isArray(r.clienti) ? r.clienti[0] : r.clienti
        return {
          id: r.id,
          clienteId: r.cliente_id,
          nome: k?.ragione_sociale ?? '—',
          telefono: k?.telefono ?? null,
          attivo: k?.attivo ?? true,
        }
      })
    },
  })
}

export type ClienteInPiu = NonNullable<ReturnType<typeof useClientiCantiere>['data']>[number]

export function useAggiungiClienteCantiere(cantiereId: string) {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (clienteId: string) => {
      const { error } = await supabase
        .from('cantiere_clienti')
        .insert({ org_id: org!.id, cantiere_id: cantiereId, cliente_id: clienteId })
      if (error) {
        // 23505 viene da due posti: il vincolo unico sulla coppia, e il
        // trigger quando il cliente e' gia' il principale. Il messaggio
        // del trigger e' gia' in italiano; quello del vincolo no.
        if (error.code === '23505') {
          throw new Error(
            error.message.includes('principale')
              ? 'Questo cliente è già il principale del cantiere.'
              : 'Questo cliente è già fra quelli del cantiere.',
          )
        }
        if (error.code === '42501') {
          throw new Error('Non hai il permesso di cambiare i clienti di questo cantiere.')
        }
        throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cantiere-clienti', cantiereId] }),
  })
}

export function useTogliClienteCantiere(cantiereId: string) {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (legameId: string) => {
      /* `.select()` per sapere se la riga e' davvero sparita. Una DELETE
         respinta dalla RLS non da' errore: tocca zero righe e basta, e
         senza questo controllo diremmo «tolto» a chi non poteva. */
      const { data, error } = await supabase
        .from('cantiere_clienti')
        .delete()
        .eq('id', legameId)
        .eq('org_id', org!.id)
        .select('id')
      if (error) throw error
      if (!data?.length) {
        throw new Error('Non hai il permesso di cambiare i clienti di questo cantiere.')
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cantiere-clienti', cantiereId] }),
  })
}
