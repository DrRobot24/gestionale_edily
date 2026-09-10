import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'

/* ══════════════════════════════════════════════════════════════════
   Il magazzino.

   La verita' sono i MOVIMENTI, non un numero da correggere a mano. Un
   numero solo non sa dire chi ha preso i venti sacchi e quando, ne' su
   quale cantiere sono finiti — che in un magazzino di cantiere sono le
   due domande che si fanno davvero.

   La giacenza si calcola, e la calcola il database: la vista
   `v_giacenze_magazzino` la restituisce gia' fatta, materiali fermi
   compresi. E' `security_invoker`, quindi il perimetro resta quello di
   chi legge.

   Tabella, vista e policy in `supabase/schema/magazzino.sql`.
   ══════════════════════════════════════════════════════════════════ */

export type Giacenza = {
  materiale_id: string
  codice: string | null
  descrizione: string
  unita_misura: string
  ubicazione: string | null
  scorta_minima: number | null
  attivo: boolean
  giacenza: number
  ultimo_movimento: string | null
}

/** Sotto scorta: c'e' una soglia, ed e' stata superata verso il basso.
 *  Senza soglia non c'e' allarme — non tutto quello che sta in
 *  magazzino ha un minimo sotto cui non deve scendere. */
export function sottoScorta(g: Giacenza): boolean {
  return g.scorta_minima !== null && Number(g.giacenza) < Number(g.scorta_minima)
}

export function useGiacenze() {
  const { org } = useSession()

  return useQuery({
    queryKey: ['magazzino', org?.id],
    enabled: Boolean(org?.id),
    queryFn: async (): Promise<Giacenza[]> => {
      const { data, error } = await supabase
        .from('v_giacenze_magazzino')
        .select(
          'materiale_id, codice, descrizione, unita_misura, ubicazione, scorta_minima, attivo, giacenza, ultimo_movimento',
        )
        .eq('org_id', org!.id)
        .order('descrizione')

      if (error) throw error

      // La vista ha tutte le colonne nullable perche' PostgREST non sa
      // che vengono da colonne NOT NULL: si normalizza qui invece di
      // spargere `?? ''` in mezzo alla pagina.
      return (data ?? []).map((r) => ({
        materiale_id: r.materiale_id as string,
        codice: r.codice,
        descrizione: r.descrizione ?? '—',
        unita_misura: r.unita_misura ?? '',
        ubicazione: r.ubicazione,
        scorta_minima: r.scorta_minima,
        attivo: r.attivo ?? true,
        giacenza: Number(r.giacenza ?? 0),
        ultimo_movimento: r.ultimo_movimento,
      }))
    },
  })
}

export type Movimento = {
  id: string
  data: string
  tipo: 'carico' | 'scarico'
  quantita: number
  riferimento: string | null
  note: string | null
  cantiere: { codice: string; denominazione: string } | null
}

/** Gli ultimi movimenti di un materiale: la storia che il numero da
 *  solo non racconta. */
export function useMovimenti(materialeId: string | undefined) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['magazzino', 'movimenti', materialeId, org?.id],
    enabled: Boolean(materialeId && org?.id),
    queryFn: async (): Promise<Movimento[]> => {
      const { data, error } = await supabase
        .from('movimenti_magazzino')
        .select('id, data, tipo, quantita, riferimento, note, cantieri ( codice, denominazione )')
        .eq('materiale_id', materialeId!)
        .eq('org_id', org!.id)
        .order('data', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error

      return (data ?? []).map((m) => {
        const c = Array.isArray(m.cantieri) ? m.cantieri[0] : m.cantieri
        return {
          id: m.id,
          data: m.data,
          tipo: m.tipo as 'carico' | 'scarico',
          quantita: Number(m.quantita),
          riferimento: m.riferimento,
          note: m.note,
          cantiere: c ? { codice: c.codice, denominazione: c.denominazione } : null,
        }
      })
    },
  })
}

export type DatiMovimento = {
  materiale_id: string
  data: string
  tipo: 'carico' | 'scarico'
  quantita: number
  cantiere_id: string | null
  riferimento: string | null
  note: string | null
}

/**
 * Registra un movimento.
 *
 * Non esiste un "modifica": un movimento sbagliato si compensa con
 * quello opposto, cosi' resta agli atti che qualcosa non tornava. Un
 * magazzino in cui si puo' riscrivere il passato non e' un magazzino,
 * e' un foglio di appunti.
 */
export function useRegistraMovimento() {
  const { org, app } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (dati: DatiMovimento) => {
      const { error } = await supabase.from('movimenti_magazzino').insert({
        ...dati,
        org_id: org!.id,
        registrato_da: app!.userId,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['magazzino'] }),
  })
}

export type DatiMateriale = {
  codice: string | null
  descrizione: string
  unita_misura: string
  ubicazione: string | null
  scorta_minima: number | null
}

export function useNuovoMateriale() {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (dati: DatiMateriale) => {
      const { error } = await supabase
        .from('materiali')
        .insert({ ...dati, org_id: org!.id, attivo: true })
      if (error) {
        if (error.code === '23505') {
          throw new Error(`Esiste già un materiale con il codice ${dati.codice}.`)
        }
        throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['magazzino'] }),
  })
}

/** Minuscole e senza accenti, come nella ricerca delle note contabili:
 *  chi cerca in cantiere scrive di fretta. */
function pulisci(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

export function cercaFra(righe: Giacenza[], cerca: string): Giacenza[] {
  const parole = pulisci(cerca).split(/\s+/).filter(Boolean)
  if (parole.length === 0) return righe

  return righe.filter((g) => {
    const dove = pulisci(`${g.descrizione} ${g.codice ?? ''} ${g.ubicazione ?? ''}`)
    return parole.every((p) => dove.includes(p))
  })
}
