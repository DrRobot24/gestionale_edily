import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'

/* ══════════════════════════════════════════════════════════════════
   Clienti — il primo anello della catena: cliente → cantiere →
   rapportino.

   Scrivere qui richiede `anagrafiche.write`, che hanno owner, admin e
   amministrazione. Verificato contro il database: un tecnico che prova a
   inserire un cliente riceve 42501 dalla RLS, non un messaggio cortese
   dall'interfaccia.
   ══════════════════════════════════════════════════════════════════ */

const SELECT =
  'id, ragione_sociale, partita_iva, codice_fiscale, indirizzo, comune, provincia, cap, email, pec, telefono, codice_sdi, note, attivo' as const

export function useClienti({ soloAttivi = true } = {}) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['clienti', org?.id, soloAttivi],
    enabled: Boolean(org?.id),
    queryFn: async () => {
      let q = supabase.from('clienti').select(SELECT).eq('org_id', org!.id)
      if (soloAttivi) q = q.eq('attivo', true)

      const { data, error } = await q.order('ragione_sociale')
      if (error) throw error
      return data
    },
  })
}

export function useCliente(id: string | undefined) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['cliente', id],
    enabled: Boolean(id && org?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clienti')
        .select(SELECT)
        .eq('id', id!)
        .eq('org_id', org!.id)
        .single()
      if (error) throw error
      return data
    },
  })
}

export type DatiCliente = {
  ragione_sociale: string
  partita_iva: string | null
  codice_fiscale: string | null
  indirizzo: string | null
  comune: string | null
  provincia: string | null
  cap: string | null
  email: string | null
  pec: string | null
  telefono: string | null
  codice_sdi: string | null
  note: string | null
}

export function useSalvaCliente() {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, dati }: { id?: string; dati: DatiCliente }) => {
      if (id) {
        const { error } = await supabase
          .from('clienti')
          .update(dati)
          .eq('id', id)
          .eq('org_id', org!.id)
        if (error) throw error
        return id
      }

      const { data, error } = await supabase
        .from('clienti')
        .insert({ ...dati, org_id: org!.id })
        .select('id')
        .single()
      if (error) {
        if (error.code === '23505') {
          throw new Error('Esiste già un cliente con questa partita IVA.')
        }
        throw error
      }
      return data.id
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['clienti'] })
      qc.invalidateQueries({ queryKey: ['cliente', id] })
    },
  })
}

export function useArchiviaCliente() {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, attivo }: { id: string; attivo: boolean }) => {
      const { error } = await supabase
        .from('clienti')
        .update({ attivo })
        .eq('id', id)
        .eq('org_id', org!.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clienti'] }),
  })
}

export function useEliminaCliente() {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clienti').delete().eq('id', id).eq('org_id', org!.id)
      if (error) {
        if (error.code === '23503') {
          throw new Error(
            'Questo cliente ha già dei cantieri collegati: eliminarlo lascerebbe quei cantieri senza committente. Archivialo invece — sparisce dalle tendine ma i cantieri restano corretti.',
          )
        }
        throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clienti'] }),
  })
}
