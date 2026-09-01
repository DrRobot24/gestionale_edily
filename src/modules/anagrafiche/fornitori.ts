import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'

/* ══════════════════════════════════════════════════════════════════
   Fornitori — l'altro capo della catena rispetto ai clienti: da qui
   entrano le bolle di trasporto e, dietro di loro, le fatture di
   acquisto che diventano costo di cantiere.

   Stessi permessi delle altre anagrafiche: `anagrafiche.write` per
   scrivere, che hanno owner, admin e amministrazione. La tabella
   esisteva gia' nel database, mancava solo l'interfaccia.
   ══════════════════════════════════════════════════════════════════ */

const SELECT =
  'id, ragione_sociale, partita_iva, categoria, indirizzo, comune, provincia, cap, email, pec, telefono, note, attivo' as const

export function useFornitori({ soloAttivi = true } = {}) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['fornitori', org?.id, soloAttivi],
    enabled: Boolean(org?.id),
    queryFn: async () => {
      let q = supabase.from('fornitori').select(SELECT).eq('org_id', org!.id)
      if (soloAttivi) q = q.eq('attivo', true)

      const { data, error } = await q.order('ragione_sociale')
      if (error) throw error
      return data
    },
  })
}

export function useFornitore(id: string | undefined) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['fornitore', id],
    enabled: Boolean(id && org?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fornitori')
        .select(SELECT)
        .eq('id', id!)
        .eq('org_id', org!.id)
        .single()
      if (error) throw error
      return data
    },
  })
}

export type DatiFornitore = {
  ragione_sociale: string
  partita_iva: string | null
  categoria: string | null
  indirizzo: string | null
  comune: string | null
  provincia: string | null
  cap: string | null
  email: string | null
  pec: string | null
  telefono: string | null
  note: string | null
}

/**
 * 23505 qui puo' venire solo da `fornitori_org_piva_uniq`, l'indice
 * unico parziale su (org_id, partita_iva) creato il 2026-09-01. E'
 * parziale su `attivo`, per questo il messaggio dice "attivo": un
 * fornitore dismesso con la stessa partita IVA non blocca niente.
 *
 * Gli altri errori tornano intatti col loro `code`: 42501 dalla RLS
 * vuol dire "non hai il permesso", ed e' un'altra storia.
 */
function traduciErrore(errore: PostgrestError): Error | PostgrestError {
  if (errore.code === '23505') {
    return new Error('Esiste già un fornitore attivo con questa partita IVA.')
  }
  return errore
}

export function useSalvaFornitore() {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, dati }: { id?: string; dati: DatiFornitore }) => {
      if (id) {
        const { error } = await supabase
          .from('fornitori')
          .update(dati)
          .eq('id', id)
          .eq('org_id', org!.id)
        if (error) throw traduciErrore(error)
        return id
      }

      const { data, error } = await supabase
        .from('fornitori')
        .insert({ ...dati, org_id: org!.id })
        .select('id')
        .single()
      if (error) throw traduciErrore(error)
      return data.id
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['fornitori'] })
      qc.invalidateQueries({ queryKey: ['fornitore', id] })
    },
  })
}

export function useArchiviaFornitore() {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, attivo }: { id: string; attivo: boolean }) => {
      const { error } = await supabase
        .from('fornitori')
        .update({ attivo })
        .eq('id', id)
        .eq('org_id', org!.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fornitori'] }),
  })
}

export function useEliminaFornitore() {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('fornitori')
        .delete()
        .eq('id', id)
        .eq('org_id', org!.id)
      if (error) {
        // Un fornitore e' agganciato da piu' parti di un cliente:
        // `materiali`, `rapportino_materiali` e ora anche `ddt`.
        if (error.code === '23503') {
          throw new Error(
            'Questo fornitore è già collegato a materiali, rapportini o bolle: eliminarlo lascerebbe quei documenti senza il loro fornitore. Archivialo invece — sparisce dalle tendine ma lo storico resta leggibile.',
          )
        }
        throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fornitori'] }),
  })
}
