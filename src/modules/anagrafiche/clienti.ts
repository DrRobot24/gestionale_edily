import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PostgrestError } from '@supabase/supabase-js'
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

/**
 * 23505 e' la violazione di un vincolo unico. Su `clienti` sono due —
 * `(org_id, partita_iva)` e `(org_id, codice_fiscale)` — e Postgres dice
 * nel messaggio quale dei due ha rifiutato la riga: senza guardarlo
 * diremmo "partita IVA" anche quando il doppione e' sul codice fiscale.
 *
 * Entrambi gli indici sono parziali su `attivo`, per questo il messaggio
 * dice "attivo": un cliente archiviato con lo stesso identificativo non
 * blocca niente, ed e' voluto.
 *
 * Gli altri errori tornano intatti, con il loro `code`: 42501 dalla RLS
 * vuole dire "non hai il permesso", ed e' un'altra storia.
 */
function traduciErrore(errore: PostgrestError): Error | PostgrestError {
  if (errore.code !== '23505') return errore
  if (errore.message.includes('clienti_org_cf_uniq')) {
    return new Error('Esiste già un cliente attivo con questo codice fiscale.')
  }
  if (errore.message.includes('clienti_org_piva_uniq')) {
    return new Error('Esiste già un cliente attivo con questa partita IVA.')
  }
  return new Error('Esiste già un cliente con questi dati.')
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
        if (error) throw traduciErrore(error)
        return id
      }

      const { data, error } = await supabase
        .from('clienti')
        .insert({ ...dati, org_id: org!.id })
        .select('id')
        .single()
      if (error) throw traduciErrore(error)
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
