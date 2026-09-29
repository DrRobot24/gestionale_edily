import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'

/* ══════════════════════════════════════════════════════════════════
   I SUBAPPALTI DELLA GIORNATA, dal 2026-09-29.

   Nel rapportino il tecnico segna quale impresa in subappalto ha
   lavorato quel giorno — scelta fra i fornitori di tipo «Subappalto» —
   cosa ha fatto, quante persone, le ore e le note. La pagina Subappalti
   li raccoglie da tutti i rapportini, con la logica dei Lavori extra.

   Persone e ore sono DELL'IMPRESA ESTERNA: non entrano nelle paghe ne'
   in `rapportino_ore`. Tabella, trigger e policy in
   `supabase/schema/subappalti.sql`.
   ══════════════════════════════════════════════════════════════════ */

export type Impresa = { id: string; ragione_sociale: string; attivo: boolean }

/** Una riga come la scrive il rapportino, prima di avere un id. */
export type RigaSubappalto = {
  fornitore_id: string
  lavorazione: string
  persone: number | null
  ore: number | null
  note: string | null
}

export type Subappalto = RigaSubappalto & {
  id: string
  rapportino_id: string
  cantiere_id: string
  data: string
  scritto_da: string | null
}

export type SubappaltoConCantiere = Subappalto & {
  cantiere: { codice: string; denominazione: string } | null
}

const CAMPI = 'id, rapportino_id, cantiere_id, data, fornitore_id, lavorazione, persone, ore, note, scritto_da'

/** Lo SQL non eseguito: nessun subappalto, non un guasto. */
export function tabellaMancante(e: unknown): boolean {
  const c = (e as { code?: string } | null)?.code
  return c === '42P01' || c === 'PGRST205' || c === 'PGRST202' || c === '42883'
}

const MANCA_SQL = 'Manca la tabella nel database: va eseguito supabase/schema/subappalti.sql.'

function numeri<T extends { persone: unknown; ore: unknown }>(r: T): T {
  return {
    ...r,
    persone: r.persone === null ? null : Number(r.persone),
    ore: r.ore === null ? null : Number(r.ore),
  }
}

/**
 * Le imprese di subappalto: nome e id, e basta.
 *
 * Passano da una funzione del database e non dalla tabella dei
 * fornitori: il tecnico l'anagrafica non la tiene, e gli serve solo
 * sapere chi scegliere. `tutte` comprende le archiviate, per dare un
 * nome alle righe vecchie.
 */
export function useImprese({ tutte = false }: { tutte?: boolean } = {}) {
  const { org } = useSession()
  return useQuery({
    queryKey: ['subappalti', 'imprese', org?.id, tutte],
    enabled: Boolean(org?.id),
    retry: false,
    queryFn: async (): Promise<Impresa[]> => {
      const { data, error } = await supabase.rpc('imprese_subappalto', {
        p_org: org!.id,
        p_tutte: tutte,
      })
      if (error) {
        if (tabellaMancante(error)) return []
        throw error
      }
      return (data ?? []) as Impresa[]
    },
  })
}

/** I subappalti di un rapportino. */
export function useSubappaltiDelRapportino(rapportinoId: string | undefined) {
  const { org } = useSession()
  return useQuery({
    queryKey: ['subappalti', 'rapportino', rapportinoId],
    enabled: Boolean(org?.id && rapportinoId),
    retry: false,
    queryFn: async (): Promise<Subappalto[]> => {
      const { data, error } = await supabase
        .from('rapportino_subappalti')
        .select(CAMPI)
        .eq('rapportino_id', rapportinoId!)
        .eq('org_id', org!.id)
        .order('created_at')
      if (error) {
        if (tabellaMancante(error)) return []
        throw error
      }
      return (data ?? []).map((r) => numeri(r)) as Subappalto[]
    },
  })
}

/** Tutti i subappalti di un periodo, col cantiere. Il perimetro lo
 *  decide la RLS: il tecnico i cantieri suoi, il titolare tutti. */
export function useSubappaltiPeriodo(da: string, a: string, abilitato = true) {
  const { org } = useSession()
  return useQuery({
    queryKey: ['subappalti', 'periodo', org?.id, da, a],
    enabled: Boolean(org?.id) && abilitato,
    retry: false,
    queryFn: async (): Promise<{ righe: SubappaltoConCantiere[]; manca: boolean }> => {
      const { data, error } = await supabase
        .from('rapportino_subappalti')
        .select(`${CAMPI}, cantieri ( codice, denominazione )`)
        .eq('org_id', org!.id)
        .gte('data', da)
        .lte('data', a)
        .order('data', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) {
        if (tabellaMancante(error)) return { righe: [], manca: true }
        throw error
      }
      type Grezza = Subappalto & {
        cantieri:
          | { codice: string; denominazione: string }
          | { codice: string; denominazione: string }[]
          | null
      }
      // PostgREST annida il cantiere come oggetto, ma i tipi lo danno a
      // volte come array: si normalizza qui, come nei lavori extra.
      const righe = ((data ?? []) as unknown as Grezza[]).map(({ cantieri, ...resto }) => {
        const c = Array.isArray(cantieri) ? cantieri[0] : cantieri
        return { ...numeri(resto), cantiere: c ?? null }
      })
      return { righe, manca: false }
    },
  })
}

function useInvalida() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['subappalti'] })
}

/** Scrive le righe di un rapportino appena nato: le chiama chi salva la
 *  scheda nuova, come per mezzi e lavori extra. */
export async function scriviSubappalti(orgId: string, rapportinoId: string, righe: RigaSubappalto[]) {
  if (righe.length === 0) return
  // Cantiere e data li copia il trigger dal rapportino: qui si mandano
  // solo perche' le colonne sono obbligatorie.
  const { data: r, error: erroreR } = await supabase
    .from('rapportini')
    .select('cantiere_id, data')
    .eq('id', rapportinoId)
    .single()
  if (erroreR) throw erroreR
  const { error } = await supabase.from('rapportino_subappalti').insert(
    righe.map((x) => ({
      ...x,
      org_id: orgId,
      rapportino_id: rapportinoId,
      cantiere_id: r.cantiere_id,
      data: r.data,
    })),
  )
  if (error) throw tabellaMancante(error) ? new Error(MANCA_SQL) : error
}

export function useAggiungiSubappalto(rapportinoId: string | undefined) {
  const { org } = useSession()
  const invalida = useInvalida()
  return useMutation({
    mutationFn: async (riga: RigaSubappalto) => {
      await scriviSubappalti(org!.id, rapportinoId!, [riga])
    },
    onSuccess: invalida,
  })
}

export function useCorreggiSubappalto() {
  const { org } = useSession()
  const invalida = useInvalida()
  return useMutation({
    mutationFn: async ({ id, riga }: { id: string; riga: RigaSubappalto }) => {
      const { data, error } = await supabase
        .from('rapportino_subappalti')
        .update(riga)
        .eq('id', id)
        .eq('org_id', org!.id)
        .select('id')
      if (error) throw tabellaMancante(error) ? new Error(MANCA_SQL) : error
      if (!data?.length) throw new Error('Non hai il permesso di correggere questo subappalto.')
    },
    onSuccess: invalida,
  })
}

export function useTogliSubappalto() {
  const { org } = useSession()
  const invalida = useInvalida()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('rapportino_subappalti')
        .delete()
        .eq('id', id)
        .eq('org_id', org!.id)
        .select('id')
      if (error) throw error
      // Il tecnico cancella solo cio' che ha scritto lui: la RLS rifiuta
      // senza errore.
      if (!data?.length) throw new Error('Puoi togliere solo i subappalti che hai scritto tu.')
    },
    onSuccess: invalida,
  })
}

/* ── ricerca, come nei lavori extra ── */

function pulisci(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

/** Ogni parola cercata deve comparire: nella lavorazione, nelle note,
 *  nel nome dell'impresa o nella data. */
export function filtra<T extends Subappalto>(righe: T[], cerca: string, nome: (id: string) => string): T[] {
  const parole = pulisci(cerca).split(/\s+/).filter(Boolean)
  if (parole.length === 0) return righe
  return righe.filter((r) => {
    const dove = pulisci(`${r.lavorazione} ${r.note ?? ''} ${nome(r.fornitore_id)} ${r.data}`)
    return parole.every((p) => dove.includes(p))
  })
}
