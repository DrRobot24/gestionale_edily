import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'

/* ══════════════════════════════════════════════════════════════════
   Mezzi e attrezzature usati in una giornata di cantiere. Dal
   2026-09-28.

   Due anagrafiche separate (`mezzi` con la targa, `attrezzature` senza),
   e quindi due tabelle di righe: `rapportino_mezzi` (da wbs-office, con
   i km) e `rapportino_attrezzature`. Qui si presentano come una lista
   sola, perche' per chi compila la domanda e' una: «cosa hai usato
   oggi». Tabelle e policy in `supabase/schema/rapportino-mezzi-
   attrezzature.sql`.
   ══════════════════════════════════════════════════════════════════ */

export type TipoRisorsa = 'mezzo' | 'attrezzatura'

/** Una voce dell'elenco da cui si sceglie. */
export type Scelta = {
  tipo: TipoRisorsa
  id: string
  etichetta: string
}

/** Una riga del rapportino, salvata o in attesa. */
export type RigaUso = {
  tipo: TipoRisorsa
  /** L'id del mezzo o dell'attrezzatura. */
  risorsaId: string
  ore: number
  /** Solo per i mezzi. */
  km: number
  note: string | null
}

export type RigaSalvata = RigaUso & { id: string; etichetta: string }

/** La tabella non c'e' ancora: lo SQL non e' stato eseguito. */
function mancante(e: unknown): boolean {
  const c = (e as { code?: string } | null)?.code
  return c === '42P01' || c === 'PGRST205'
}

function nome(codice: string | null, descrizione: string, extra: string | null): string {
  return [codice, descrizione, extra].filter(Boolean).join(' · ')
}

/** Tutto quello che si puo' scegliere: mezzi e attrezzature attivi. */
export function useSceltePerRapportino() {
  const { org } = useSession()

  return useQuery({
    queryKey: ['mezzi-attrezzature', 'scelte', org?.id],
    enabled: Boolean(org?.id),
    retry: false,
    queryFn: async (): Promise<Scelta[]> => {
      const [m, a] = await Promise.all([
        supabase
          .from('mezzi')
          .select('id, codice, descrizione, targa')
          .eq('org_id', org!.id)
          .eq('attivo', true)
          .order('descrizione'),
        supabase
          .from('attrezzature')
          .select('id, codice, descrizione, matricola')
          .eq('org_id', org!.id)
          .eq('attivo', true)
          .order('descrizione'),
      ])
      if (m.error && !mancante(m.error)) throw m.error
      if (a.error && !mancante(a.error)) throw a.error
      return [
        ...(m.data ?? []).map((x) => ({
          tipo: 'mezzo' as const,
          id: x.id,
          etichetta: nome(x.codice, x.descrizione, x.targa),
        })),
        ...(a.data ?? []).map((x) => ({
          tipo: 'attrezzatura' as const,
          id: x.id,
          etichetta: nome(x.codice, x.descrizione, x.matricola),
        })),
      ]
    },
  })
}

/** Le righe gia' salvate di un rapportino. */
export function useUsiDelRapportino(rapportinoId: string | undefined) {
  return useQuery({
    queryKey: ['mezzi-attrezzature', 'rapportino', rapportinoId],
    enabled: Boolean(rapportinoId),
    retry: false,
    queryFn: async (): Promise<RigaSalvata[]> => {
      const [m, a] = await Promise.all([
        supabase
          .from('rapportino_mezzi')
          .select('id, mezzo_id, ore_utilizzo, km, note, mezzi ( codice, descrizione, targa )')
          .eq('rapportino_id', rapportinoId!),
        supabase
          .from('rapportino_attrezzature')
          .select(
            'id, attrezzatura_id, ore_utilizzo, note, attrezzature ( codice, descrizione, matricola )',
          )
          .eq('rapportino_id', rapportinoId!),
      ])
      if (m.error && !mancante(m.error)) throw m.error
      if (a.error && !mancante(a.error)) throw a.error
      return [
        ...(m.data ?? []).map((r) => ({
          id: r.id,
          tipo: 'mezzo' as const,
          risorsaId: r.mezzo_id,
          ore: Number(r.ore_utilizzo),
          km: Number(r.km),
          note: r.note,
          etichetta: r.mezzi ? nome(r.mezzi.codice, r.mezzi.descrizione, r.mezzi.targa) : 'mezzo',
        })),
        ...(a.data ?? []).map((r) => ({
          id: r.id,
          tipo: 'attrezzatura' as const,
          risorsaId: r.attrezzatura_id,
          ore: Number(r.ore_utilizzo),
          km: 0,
          note: r.note,
          etichetta: r.attrezzature
            ? nome(r.attrezzature.codice, r.attrezzature.descrizione, r.attrezzature.matricola)
            : 'attrezzatura',
        })),
      ]
    },
  })
}

/**
 * Scrive delle righe su un rapportino che esiste. Lo usa il riquadro su
 * una scheda gia' salvata, e `NuovoRapportino` subito dopo aver creato
 * la scheda.
 */
export async function scriviUsi(orgId: string, rapportinoId: string, righe: RigaUso[]) {
  const mezzi = righe.filter((r) => r.tipo === 'mezzo')
  const attrezzi = righe.filter((r) => r.tipo === 'attrezzatura')

  if (mezzi.length > 0) {
    const { error } = await supabase.from('rapportino_mezzi').insert(
      mezzi.map((r) => ({
        org_id: orgId,
        rapportino_id: rapportinoId,
        mezzo_id: r.risorsaId,
        ore_utilizzo: r.ore,
        km: r.km,
        note: r.note,
      })),
    )
    if (error) throw error
  }
  if (attrezzi.length > 0) {
    const { error } = await supabase.from('rapportino_attrezzature').insert(
      attrezzi.map((r) => ({
        org_id: orgId,
        rapportino_id: rapportinoId,
        attrezzatura_id: r.risorsaId,
        ore_utilizzo: r.ore,
        note: r.note,
      })),
    )
    if (error) {
      if (error.code === '23505') throw new Error('Questa attrezzatura è già nella scheda.')
      throw error
    }
  }
}

export function useAggiungiUso(rapportinoId: string | undefined) {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (riga: RigaUso) => scriviUsi(org!.id, rapportinoId!, [riga]),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['mezzi-attrezzature', 'rapportino', rapportinoId] }),
  })
}

export function useTogliUso(rapportinoId: string | undefined) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (riga: RigaSalvata) => {
      const tabella = riga.tipo === 'mezzo' ? 'rapportino_mezzi' : 'rapportino_attrezzature'
      // Una DELETE respinta dalla RLS tocca zero righe senza errore.
      const { data, error } = await supabase.from(tabella).delete().eq('id', riga.id).select('id')
      if (error) throw error
      if (!data?.length) throw new Error('Il database non ti permette di togliere questa riga.')
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['mezzi-attrezzature', 'rapportino', rapportinoId] }),
  })
}
