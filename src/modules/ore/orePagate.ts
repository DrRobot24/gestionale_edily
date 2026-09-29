import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'

/* ══════════════════════════════════════════════════════════════════
   LE ORE PAGATE, dal 2026-09-29: sulle giornate gialle del foglio
   presenze il titolare decide quante ore pagare.

   «Se le 2 ore mancanti le vuole pagare, si normalizza da 6 a 8; se ci
   sono 10 ore di cui 2 di straordinario, puo' dire: io ne pago solo 1»
   (utente). E' una decisione ECONOMICA: le ore validate dei rapportini
   — il flusso primario, dal campo alla scrivania — non si toccano. Il
   Riepilogo economico paga queste al posto delle lavorate.

   Una decisione vale solo finche' la giornata e' quella su cui e' stata
   presa: si ricordano le ore lavorate di allora, e se sono cambiate la
   decisione e' «da rivedere» e si pagano le lavorate. Vedi
   `supabase/schema/ore-pagate.sql`.
   ══════════════════════════════════════════════════════════════════ */

export type OrePagate = {
  id: string
  dipendente_id: string
  data: string
  ore_lavorate: number
  ore_pagate: number
  nota: string | null
  deciso_at: string
}

export const chiaveGiorno = (dipendenteId: string, data: string) => `${dipendenteId}|${data}`

/** Lo SQL non eseguito: nessuna decisione, non un guasto. */
function tabellaMancante(e: unknown): boolean {
  const c = (e as { code?: string } | null)?.code
  return c === '42P01' || c === 'PGRST205'
}

/** Le decisioni di un periodo, per persona e giorno. */
export function useOrePagate(dal: string, al: string, abilitato = true) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['ore-pagate', org?.id, dal, al],
    enabled: Boolean(org?.id) && abilitato,
    retry: false,
    queryFn: async (): Promise<Map<string, OrePagate>> => {
      const { data, error } = await supabase
        .from('ore_pagate')
        .select('id, dipendente_id, data, ore_lavorate, ore_pagate, nota, deciso_at')
        .eq('org_id', org!.id)
        .gte('data', dal)
        .lte('data', al)
      if (error) {
        if (tabellaMancante(error)) return new Map()
        throw error
      }
      return new Map(
        (data ?? []).map((r) => [
          chiaveGiorno(r.dipendente_id, r.data),
          { ...r, ore_lavorate: Number(r.ore_lavorate), ore_pagate: Number(r.ore_pagate) },
        ]),
      )
    },
  })
}

/**
 * Quante ore si pagano in un giorno: la decisione del titolare se c'e' e
 * vale ancora, altrimenti le lavorate.
 *
 * `valida` e' falso quando la giornata e' cambiata dopo la decisione.
 */
export function orePagateDelGiorno(
  decisione: OrePagate | undefined,
  lavorate: number,
): { ore: number; decisa: boolean; daRivedere: boolean } {
  if (!decisione) return { ore: lavorate, decisa: false, daRivedere: false }
  if (decisione.ore_lavorate !== lavorate) return { ore: lavorate, decisa: false, daRivedere: true }
  return { ore: decisione.ore_pagate, decisa: true, daRivedere: false }
}

function useInvalida() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['ore-pagate'] })
}

function errore(e: { code?: string; message: string }): Error {
  if (tabellaMancante(e))
    return new Error('Manca la tabella nel database: va eseguito supabase/schema/ore-pagate.sql.')
  return new Error(e.message)
}

export function useDecidiOrePagate() {
  const { org } = useSession()
  const invalida = useInvalida()

  return useMutation({
    mutationFn: async (d: {
      dipendente_id: string
      data: string
      ore_lavorate: number
      ore_pagate: number
      nota: string | null
    }) => {
      const { data, error } = await supabase
        .from('ore_pagate')
        .upsert({ ...d, org_id: org!.id }, { onConflict: 'dipendente_id,data' })
        .select('id')
      if (error) throw errore(error)
      // La RLS rifiuta senza errore quando il mese e' gia' inviato.
      if (!data?.length)
        throw new Error('Il foglio definitivo di questo mese è già stato inviato: non si cambia più.')
    },
    onSuccess: invalida,
  })
}

export function useTogliOrePagate() {
  const { org } = useSession()
  const invalida = useInvalida()

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('ore_pagate')
        .delete()
        .eq('id', id)
        .eq('org_id', org!.id)
        .select('id')
      if (error) throw errore(error)
      if (!data?.length)
        throw new Error('Il foglio definitivo di questo mese è già stato inviato: non si cambia più.')
    },
    onSuccess: invalida,
  })
}
