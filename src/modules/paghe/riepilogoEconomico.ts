import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'

/* ══════════════════════════════════════════════════════════════════
   IL RIEPILOGO ECONOMICO DEL MESE, dal 2026-09-25.

   Tabelle e funzioni in `supabase/schema/riepilogo-economico.sql`, che
   spiega il perche' di tutto. In breve:

     bozza     Stefania guarda i numeri, scrive acconti, rimborsi e
               trattenute, e quando tutto coincide lo INVIA
     inviato   il titolare lo firma, o lo rimanda indietro col motivo
     validato  archiviato: fotografato, i rapportini del mese passano a
               «contabilizzato», e si stampa il PDF per i bonifici.
               Solo il titolare lo riapre, col motivo.

   Finche' e' in bozza i numeri si calcolano dal vivo. Da inviato in poi
   si leggono dalla FOTOGRAFIA (`paghe_righe`): il titolare firma quello
   che gli e' stato mandato, e l'archivio non si muove se domani cambia
   una tariffa.
   ══════════════════════════════════════════════════════════════════ */

export type StatoPaghe = 'bozza' | 'inviato' | 'validato'

export type MesePaghe = {
  id: string
  stato: StatoPaghe
  inviato_at: string | null
  validato_at: string | null
  motivo: string | null
}

export type TipoMovimento = 'acconto' | 'rimborso' | 'trattenuta'

export type Movimento = {
  id: string
  dipendente_id: string
  tipo: TipoMovimento
  importo: number
  motivo: string
}

/** La riga fotografata, come la scrive `invia_paghe`. */
export type RigaPaghe = {
  dipendente_id: string
  nominativo: string
  tipo: string | null
  giorni: number
  ore_lavorate: number
  ore_straordinarie: number
  ore_ferie: number
  ore_permessi: number
  ore_altre: number
  regime: 'globale' | 'giornaliera' | null
  paga_globale: number | null
  tariffa: number | null
  maturato: number
  acconti: number
  rimborsi: number
  trattenute: number
  da_bonificare: number
  movimenti: { tipo: TipoMovimento; importo: number; motivo: string }[]
}

/** La tabella non c'e' ancora: lo SQL non e' stato eseguito. */
export function tabellaMancante(e: unknown): boolean {
  const c = (e as { code?: string } | null)?.code
  return c === '42P01' || c === 'PGRST205'
}

export function useMesePaghe(anno: number, mese: number) {
  const { org } = useSession()
  return useQuery({
    queryKey: ['paghe', 'mese', org?.id, anno, mese],
    enabled: Boolean(org?.id),
    retry: false,
    queryFn: async (): Promise<MesePaghe | null> => {
      const { data, error } = await supabase
        .from('paghe_mesi')
        .select('id, stato, inviato_at, validato_at, motivo')
        .eq('org_id', org!.id)
        .eq('anno', anno)
        .eq('mese', mese)
        .maybeSingle()
      if (error) throw error
      return data as MesePaghe | null
    },
  })
}

export function useMovimenti(anno: number, mese: number) {
  const { org } = useSession()
  return useQuery({
    queryKey: ['paghe', 'movimenti', org?.id, anno, mese],
    enabled: Boolean(org?.id),
    retry: false,
    queryFn: async (): Promise<Movimento[]> => {
      const { data, error } = await supabase
        .from('paghe_movimenti')
        .select('id, dipendente_id, tipo, importo, motivo')
        .eq('org_id', org!.id)
        .eq('anno', anno)
        .eq('mese', mese)
        .order('created_at')
      if (error) throw error
      return (data ?? []).map((m) => ({ ...m, importo: Number(m.importo) })) as Movimento[]
    },
  })
}

/** La fotografia del mese: c'e' solo da «inviato» in poi. */
export function useRighePaghe(meseId: string | undefined) {
  return useQuery({
    queryKey: ['paghe', 'righe', meseId],
    enabled: Boolean(meseId),
    queryFn: async (): Promise<RigaPaghe[]> => {
      const { data, error } = await supabase
        .from('paghe_righe')
        .select('*')
        .eq('mese_id', meseId!)
        .order('nominativo')
      if (error) throw error
      return (data ?? []).map((r) => ({
        ...r,
        giorni: Number(r.giorni),
        ore_lavorate: Number(r.ore_lavorate),
        ore_straordinarie: Number(r.ore_straordinarie),
        ore_ferie: Number(r.ore_ferie),
        ore_permessi: Number(r.ore_permessi),
        ore_altre: Number(r.ore_altre),
        paga_globale: r.paga_globale === null ? null : Number(r.paga_globale),
        tariffa: r.tariffa === null ? null : Number(r.tariffa),
        maturato: Number(r.maturato),
        acconti: Number(r.acconti),
        rimborsi: Number(r.rimborsi),
        trattenute: Number(r.trattenute),
        da_bonificare: Number(r.da_bonificare),
        movimenti: Array.isArray(r.movimenti) ? r.movimenti : [],
      })) as unknown as RigaPaghe[]
    },
  })
}

export function useAggiungiMovimento(anno: number, mese: number) {
  const { org } = useSession()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (m: Omit<Movimento, 'id'>) => {
      const { data, error } = await supabase
        .from('paghe_movimenti')
        .insert({ ...m, anno, mese, org_id: org!.id })
        .select('id')
      if (error) throw error
      // Il mese gia' inviato: la RLS rifiuta senza errore.
      if (!data?.length) throw new Error('Il riepilogo di questo mese è già stato inviato.')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['paghe', 'movimenti'] }),
  })
}

export function useEliminaMovimento() {
  const { org } = useSession()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('paghe_movimenti')
        .delete()
        .eq('id', id)
        .eq('org_id', org!.id)
        .select('id')
      if (error) throw error
      if (!data?.length) throw new Error('Il riepilogo di questo mese è già stato inviato.')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['paghe', 'movimenti'] }),
  })
}

function useInvalidaPaghe() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['paghe'] })
    // Validando e riaprendo cambiano gli stati dei rapportini del mese
    // (anche le consegne in home stanno sotto questa chiave).
    qc.invalidateQueries({ queryKey: ['rapportini'] })
  }
}

export function useInviaPaghe(anno: number, mese: number) {
  const { org } = useSession()
  const invalida = useInvalidaPaghe()
  return useMutation({
    mutationFn: async (righe: RigaPaghe[]) => {
      const { error } = await supabase.rpc('invia_paghe', {
        p_org: org!.id,
        p_anno: anno,
        p_mese: mese,
        p_righe: righe,
      })
      if (error) throw error
    },
    onSuccess: invalida,
  })
}

export function useDecidiPaghe(anno: number, mese: number) {
  const { org } = useSession()
  const invalida = useInvalidaPaghe()
  return useMutation({
    mutationFn: async ({ valida, motivo }: { valida: boolean; motivo?: string }) => {
      const { error } = await supabase.rpc('decidi_paghe', {
        p_org: org!.id,
        p_anno: anno,
        p_mese: mese,
        p_valida: valida,
        p_motivo: motivo,
      })
      if (error) throw error
    },
    onSuccess: invalida,
  })
}

export function useRiapriPaghe(anno: number, mese: number) {
  const { org } = useSession()
  const invalida = useInvalidaPaghe()
  return useMutation({
    mutationFn: async (motivo: string) => {
      const { error } = await supabase.rpc('riapri_paghe', {
        p_org: org!.id,
        p_anno: anno,
        p_mese: mese,
        p_motivo: motivo,
      })
      if (error) throw error
    },
    onSuccess: invalida,
  })
}

/** I riepiloghi che aspettano la firma del titolare, per la sua home. */
export function useRiepiloghiDaFirmare(abilitato: boolean) {
  const { org } = useSession()
  return useQuery({
    queryKey: ['paghe', 'da-firmare', org?.id],
    enabled: Boolean(org?.id) && abilitato,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('paghe_mesi')
        .select('anno, mese')
        .eq('org_id', org!.id)
        .eq('stato', 'inviato')
        .order('anno')
        .order('mese')
      if (error) throw error
      return data ?? []
    },
  })
}
