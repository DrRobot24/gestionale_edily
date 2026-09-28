import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'

/* ══════════════════════════════════════════════════════════════════
   L'IBAN di una risorsa: dove va il bonifico. Dal 2026-09-28.

   Tabella sua, chiusa su `paghe.read` — il perche' sta in
   `supabase/schema/iban-risorse.sql`. Una riga per persona, senza
   storico: un conto cambiato si sovrascrive.
   ══════════════════════════════════════════════════════════════════ */

export type Iban = {
  dipendente_id: string
  iban: string
  intestatario: string | null
}

/** La tabella non c'e' ancora: lo SQL non e' stato eseguito. */
export function ibanMancante(e: unknown): boolean {
  const c = (e as { code?: string } | null)?.code
  return c === '42P01' || c === 'PGRST205'
}

/** Maiuscolo e senza spazi: la forma in cui si salva. */
export function pulisciIban(s: string): string {
  return s.replace(/\s+/g, '').toUpperCase()
}

/** A gruppi di quattro, come sta stampato sulla carta: «IT60 X054 2811…». */
export function mostraIban(s: string): string {
  return pulisciIban(s).replace(/(.{4})/g, '$1 ').trim()
}

/**
 * Il controllo delle due cifre dopo il paese (ISO 13616, modulo 97).
 *
 * Una cifra sbagliata copiando dal foglio vuol dire un bonifico
 * respinto — o peggio, arrivato a un altro. Il controllo la prende quasi
 * sempre, e costa niente farlo prima di salvare.
 */
export function ibanValido(s: string): boolean {
  const v = pulisciIban(s)
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(v)) return false
  // Un IBAN italiano e' sempre di 27 caratteri.
  if (v.startsWith('IT') && v.length !== 27) return false
  const girato = v.slice(4) + v.slice(0, 4)
  let resto = 0
  for (const ch of girato) {
    const n = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch
    for (const cifra of n) resto = (resto * 10 + Number(cifra)) % 97
  }
  return resto === 1
}

/** Uno per persona, oppure tutti quelli dell'azienda (per il Riepilogo). */
export function useIban({ abilitato }: { abilitato: boolean }) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['iban', org?.id],
    enabled: Boolean(org?.id) && abilitato,
    retry: false,
    queryFn: async (): Promise<Map<string, Iban>> => {
      const { data, error } = await supabase
        .from('dipendente_iban')
        .select('dipendente_id, iban, intestatario')
        .eq('org_id', org!.id)
      if (error) {
        // Lo SQL non eseguito: nessun IBAN, non un guasto.
        if (ibanMancante(error)) return new Map()
        throw error
      }
      return new Map((data ?? []).map((r) => [r.dipendente_id, r]))
    },
  })
}

export function useSalvaIban() {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (r: Iban) => {
      const { error } = await supabase
        .from('dipendente_iban')
        .upsert({ ...r, iban: pulisciIban(r.iban), org_id: org!.id })
      if (error) {
        if (ibanMancante(error)) {
          throw new Error(
            'Manca la tabella nel database: va eseguito supabase/schema/iban-risorse.sql.',
          )
        }
        throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['iban'] }),
  })
}

export function useEliminaIban() {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (dipendenteId: string) => {
      const { error } = await supabase
        .from('dipendente_iban')
        .delete()
        .eq('dipendente_id', dipendenteId)
        .eq('org_id', org!.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['iban'] }),
  })
}
