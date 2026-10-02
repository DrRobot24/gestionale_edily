import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'
import {
  ASSENZE_PAGATE_PREDEFINITE,
  MOTIVI_PAGABILI,
  type AssenzePagate,
} from '../anagrafiche/retribuzione'

/* ══════════════════════════════════════════════════════════════════
   QUALI ASSENZE SI PAGANO, dal 2026-10-02: gli interruttori del
   titolare (pagina Impostazioni, `supabase/schema/assenze-pagate.sql`).

   Nel database una colonna per regime e motivo (`globale_ferie`,
   `giornaliera_malattia`...); qui la stessa cosa nella forma che usa il
   calcolo del maturato, per origine della tariffa: `calcolata` e' la
   paga globale, `manuale` la giornaliera.

   Senza la riga — o senza la tabella, se lo SQL non e' stato eseguito —
   valgono i valori di partenza, gli stessi del database.
   ══════════════════════════════════════════════════════════════════ */

const COLONNA = { calcolata: 'globale', manuale: 'giornaliera' } as const

type Riga = Record<string, boolean | string | null>

function daRiga(r: Riga | null): AssenzePagate {
  const out: AssenzePagate = {
    calcolata: { ...ASSENZE_PAGATE_PREDEFINITE.calcolata },
    manuale: { ...ASSENZE_PAGATE_PREDEFINITE.manuale },
  }
  if (!r) return out
  for (const regime of ['calcolata', 'manuale'] as const) {
    for (const m of MOTIVI_PAGABILI) {
      const v = r[`${COLONNA[regime]}_${m}`]
      if (typeof v === 'boolean') out[regime][m] = v
    }
  }
  return out
}

function aRiga(a: AssenzePagate): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const regime of ['calcolata', 'manuale'] as const) {
    for (const m of MOTIVI_PAGABILI) out[`${COLONNA[regime]}_${m}`] = a[regime][m]
  }
  return out
}

/** La tabella non c'e' ancora: lo SQL non e' stato eseguito. */
export function assenzePagateMancanti(e: unknown): boolean {
  const c = (e as { code?: string } | null)?.code
  return c === '42P01' || c === 'PGRST205'
}

export function useAssenzePagate() {
  const { org } = useSession()

  return useQuery({
    queryKey: ['assenze-pagate', org?.id],
    enabled: Boolean(org?.id),
    retry: false,
    queryFn: async (): Promise<AssenzePagate> => {
      const { data, error } = await supabase
        .from('assenze_pagate')
        .select('*')
        .eq('org_id', org!.id)
        .maybeSingle()
      if (error) {
        if (assenzePagateMancanti(error)) return daRiga(null)
        throw error
      }
      return daRiga(data as Riga | null)
    },
  })
}

export function useSalvaAssenzePagate() {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (a: AssenzePagate) => {
      const { error } = await supabase
        .from('assenze_pagate')
        .upsert({ org_id: org!.id, ...aRiga(a) })
      if (error) {
        if (assenzePagateMancanti(error)) {
          throw new Error(
            'Manca la tabella nel database: va eseguito supabase/schema/assenze-pagate.sql.',
          )
        }
        throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assenze-pagate'] }),
  })
}
