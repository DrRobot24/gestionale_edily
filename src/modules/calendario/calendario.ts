import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import {
  eLavorabile,
  festivita,
  nonLavorativo,
  ultimoLavorabile,
  type Patrono,
} from '../../lib/giorni'
import { useSession } from '../auth/SessionProvider'

/* ══════════════════════════════════════════════════════════════════
   IL CALENDARIO DELL'IMPRESA, dal 2026-10-02.

   Le regole stanno in `lib/giorni.ts` e sono funzioni pure; qui si
   legano al patrono dell'impresa (`azienda_calendario`, vedi
   `supabase/schema/festivita.sql`), cosi' le pagine chiedono «si
   lavora?» senza portarsi dietro il patrono a mano.

   Finche' il patrono non e' letto — o se lo SQL non e' ancora stato
   eseguito — valgono le sole festivita' nazionali: un calendario un
   attimo meno preciso, non una pagina ferma.
   ══════════════════════════════════════════════════════════════════ */

/** La tabella non c'e' ancora: lo SQL non e' stato eseguito. */
export function calendarioMancante(e: unknown): boolean {
  const c = (e as { code?: string } | null)?.code
  return c === '42P01' || c === 'PGRST205'
}

export function usePatrono() {
  const { org } = useSession()

  return useQuery({
    queryKey: ['patrono', org?.id],
    enabled: Boolean(org?.id),
    retry: false,
    // Cambia una volta nella vita dell'impresa.
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<Patrono | null> => {
      const { data, error } = await supabase
        .from('azienda_calendario')
        .select('patrono, patrono_nome')
        .eq('org_id', org!.id)
        .maybeSingle()
      if (error) {
        if (calendarioMancante(error)) return null
        throw error
      }
      return data?.patrono ? { giorno: data.patrono, nome: data.patrono_nome } : null
    },
  })
}

/** Le regole dei giorni, gia' legate al patrono dell'impresa. */
export function useCalendario() {
  const { data } = usePatrono()
  const patrono = data ?? null

  return useMemo(
    () => ({
      patrono,
      festivita: (iso: string) => festivita(iso, patrono),
      lavorabile: (iso: string) => eLavorabile(iso, patrono),
      nonLavorativo: (iso: string) => nonLavorativo(iso, patrono),
      ultimoLavorabile: (iso: string) => ultimoLavorabile(iso, patrono),
    }),
    [patrono],
  )
}

export function useSalvaPatrono() {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    /** `null` toglie il patrono. */
    mutationFn: async (p: Patrono | null) => {
      const { error } = await supabase.from('azienda_calendario').upsert({
        org_id: org!.id,
        patrono: p?.giorno ?? null,
        patrono_nome: p?.nome?.trim() || null,
      })
      if (error) {
        if (calendarioMancante(error)) {
          throw new Error(
            'Manca la tabella nel database: va eseguito supabase/schema/festivita.sql.',
          )
        }
        throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['patrono'] }),
  })
}
