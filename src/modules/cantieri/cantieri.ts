import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Database } from '../../lib/database.types'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'

export type CantiereStato = Database['public']['Enums']['cantiere_stato']

const CAMPI =
  'id, codice, denominazione, cliente_id, stato, indirizzo, comune, provincia, cap, ' +
  'data_inizio, data_fine_prevista, data_fine_effettiva, importo_contratto, responsabile_id, note'

export function useCantiere(id: string | undefined) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['cantiere', id],
    enabled: Boolean(id && org?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cantieri')
        .select(`${CAMPI}, clienti ( ragione_sociale )`)
        .eq('id', id!)
        .eq('org_id', org!.id)
        .single()
      if (error) throw error
      return data
    },
  })
}

export type DatiCantiere = {
  codice: string
  denominazione: string
  cliente_id: string | null
  stato: CantiereStato
  indirizzo: string | null
  comune: string | null
  provincia: string | null
  cap: string | null
  data_inizio: string | null
  data_fine_prevista: string | null
  data_fine_effettiva: string | null
  importo_contratto: number | null
  responsabile_id: string | null
  note: string | null
}

export function useSalvaCantiere() {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, dati }: { id?: string; dati: DatiCantiere }) => {
      if (id) {
        const { error } = await supabase
          .from('cantieri')
          .update(dati)
          .eq('id', id)
          .eq('org_id', org!.id)
        if (error) throw error
        return id
      }

      const { data, error } = await supabase
        .from('cantieri')
        .insert({ ...dati, org_id: org!.id })
        .select('id')
        .single()

      if (error) {
        // Il codice cantiere e' quello che tutti usano per parlarne al
        // telefono: due cantieri con lo stesso codice sono un disastro
        // che si scopre tardi. Se il database ha un vincolo di unicita',
        // qui la traduciamo in una frase invece che in un 23505.
        if (error.code === '23505') {
          throw new Error(`Esiste già un cantiere con il codice ${dati.codice}.`)
        }
        throw error
      }
      return data.id
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['cantieri'] })
      qc.invalidateQueries({ queryKey: ['cantiere', id] })
    },
  })
}

/**
 * I cantieri non hanno `attivo` come le anagrafiche: hanno `stato`, e
 * `archiviato` e' uno dei cinque valori dell'enum. Archiviare qui e'
 * quindi un cambio di stato, non una bandierina a parte.
 */
export function useCambiaStatoCantiere() {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, stato }: { id: string; stato: CantiereStato }) => {
      const { error } = await supabase
        .from('cantieri')
        .update({ stato })
        .eq('id', id)
        .eq('org_id', org!.id)
      if (error) throw error
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['cantieri'] })
      qc.invalidateQueries({ queryKey: ['cantiere', v.id] })
    },
  })
}

export function useEliminaCantiere() {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cantieri').delete().eq('id', id).eq('org_id', org!.id)
      if (error) {
        if (error.code === '23503') {
          throw new Error(
            'Su questo cantiere ci sono già rapportini, costi o assegnazioni: eliminarlo cancellerebbe della storia. Mettilo in stato “archiviato” invece.',
          )
        }
        throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cantieri'] }),
  })
}
