import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'
import type { TipoParco } from './parco'

/* ══════════════════════════════════════════════════════════════════
   LE SPESE DI UN MEZZO O DI UN'ATTREZZATURA. Dal 2026-09-29.

   «Sia per mezzi che attrezzature creare un campo di inserimento spese
   relativo a quel mezzo o attrezzatura, che poi in futuro fara' match
   con i fornitori» (utente). Carburante, tagliandi, riparazioni, gomme,
   il premio dell'assicurazione, il bollo.

   IL FORNITORE E IL NUMERO DEL DOCUMENTO sono le due chiavi con cui la
   spesa si abbinera' alla fattura quando arrivera' il ciclo fornitori.
   Oggi facoltativi: lo scontrino del gasolio non ha un fornitore in
   anagrafica.

   Tabella e policy in `supabase/schema/parco-schede-spese.sql`: le
   vede e le scrive chi ha `anagrafiche.write`, Stefania e il titolare.
   ══════════════════════════════════════════════════════════════════ */

export const CATEGORIE_SPESA = [
  { valore: 'carburante', etichetta: 'Carburante' },
  { valore: 'manutenzione', etichetta: 'Manutenzione / tagliando' },
  { valore: 'riparazione', etichetta: 'Riparazione' },
  { valore: 'pneumatici', etichetta: 'Pneumatici' },
  { valore: 'assicurazione', etichetta: 'Assicurazione' },
  { valore: 'bollo', etichetta: 'Bollo' },
  { valore: 'revisione', etichetta: 'Revisione' },
  { valore: 'verifica', etichetta: 'Verifica periodica' },
  { valore: 'noleggio', etichetta: 'Noleggio' },
  { valore: 'altro', etichetta: 'Altro' },
] as const

export type CategoriaSpesa = (typeof CATEGORIE_SPESA)[number]['valore']

export function etichettaCategoria(v: string): string {
  return CATEGORIE_SPESA.find((c) => c.valore === v)?.etichetta ?? v
}

export type Spesa = {
  id: string
  data: string
  categoria: string
  descrizione: string | null
  importo: number
  fornitore_id: string | null
  numero_documento: string | null
  fornitore: { ragione_sociale: string } | null
  /* Il carburante, dal 2026-10-02 (`parco-consegne-carburante.sql`):
     litri, km o ore al contatore, chi ha fatto rifornimento. */
  litri: number | null
  contatore: number | null
  dipendente_id: string | null
  dipendente: { cognome: string; nome: string } | null
}

export type DatiSpesa = {
  data: string
  categoria: CategoriaSpesa
  descrizione: string | null
  importo: number
  fornitore_id: string | null
  numero_documento: string | null
  litri?: number | null
  contatore?: number | null
  dipendente_id?: string | null
}

/** La colonna che punta alla cosa: una per tipo. */
const COLONNA: Record<TipoParco, 'mezzo_id' | 'attrezzatura_id'> = {
  mezzi: 'mezzo_id',
  attrezzature: 'attrezzatura_id',
}

export function useSpeseParco(tipo: TipoParco, id: string | undefined, abilitato: boolean) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['spese-parco', tipo, id, org?.id],
    enabled: Boolean(id && org?.id) && abilitato,
    queryFn: async (): Promise<Spesa[]> => {
      const { data, error } = await supabase
        .from('parco_spese')
        .select(
          'id, data, categoria, descrizione, importo, fornitore_id, numero_documento, fornitore:fornitori(ragione_sociale), ' +
            'litri, contatore, dipendente_id, dipendente:dipendenti(cognome, nome)',
        )
        .eq('org_id', org!.id)
        .eq(COLONNA[tipo], id!)
        .order('data', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as Spesa[]
    },
  })
}

export function useSalvaSpesa(tipo: TipoParco, voceId: string) {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, dati }: { id?: string; dati: DatiSpesa }) => {
      if (id) {
        const { error } = await supabase
          .from('parco_spese')
          .update(dati)
          .eq('id', id)
          .eq('org_id', org!.id)
        if (error) throw error
        return
      }
      const { error } = await supabase
        .from('parco_spese')
        .insert({ ...dati, org_id: org!.id, [COLONNA[tipo]]: voceId })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['spese-parco', tipo, voceId] }),
  })
}

export function useEliminaSpesa(tipo: TipoParco, voceId: string) {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('parco_spese').delete().eq('id', id).eq('org_id', org!.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['spese-parco', tipo, voceId] }),
  })
}
