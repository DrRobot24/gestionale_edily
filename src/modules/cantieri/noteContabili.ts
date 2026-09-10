import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'

/* ══════════════════════════════════════════════════════════════════
   Le note contabili: le ore in economia di un cantiere.

   In edilizia il lavoro si paga in due modi. A MISURA, sulle quantita'
   previste dal progetto. In ECONOMIA, sulle ore effettivamente impiegate
   per cio' che nel progetto non c'era.

   Una nota contabile registra il secondo: «due ore per rimuovere il nido
   d'api trovato prima di alzare il muro». Ore che si ribaltano al
   cliente come costo sopraggiunto.

   ATTENZIONE, e' il punto piu' facile da fraintendere: queste ore NON si
   sommano a quelle del rapportino. Le due ore del nido d'api stanno gia'
   dentro la giornata di chi le ha fatte. Qui non si aggiungono, si
   CLASSIFICANO — per poterle fatturare. Chi somma le ore per le paghe
   continua a guardare `rapportino_ore` e non deve toccare questa
   tabella.

   Tabella e policy in `supabase/schema/note-contabili.sql`.
   ══════════════════════════════════════════════════════════════════ */

export type NotaContabile = {
  id: string
  cantiere_id: string
  data: string
  descrizione: string
  ore: number
  note: string | null
  scritta_da: string | null
  created_at: string
}

const CAMPI = 'id, cantiere_id, data, descrizione, ore, note, scritta_da, created_at'

/** Dal giorno piu' recente: chi apre la pagina vuole prima quello che e'
 *  successo ieri, non quello di tre mesi fa. */
export function useNoteContabili(cantiereId: string | undefined) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['note-contabili', cantiereId, org?.id],
    enabled: Boolean(cantiereId && org?.id),
    queryFn: async (): Promise<NotaContabile[]> => {
      const { data, error } = await supabase
        .from('note_contabili')
        .select(CAMPI)
        .eq('cantiere_id', cantiereId!)
        .eq('org_id', org!.id)
        .order('data', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data ?? []) as NotaContabile[]
    },
  })
}

export type DatiNota = {
  data: string
  descrizione: string
  ore: number
  note: string | null
}

/** Un hook solo per creare e per correggere: due hook quasi identici
 *  divergono al primo campo aggiunto, e divergono in silenzio. */
export function useSalvaNota() {
  const { org, app } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      cantiereId,
      dati,
    }: {
      id?: string
      cantiereId: string
      dati: DatiNota
    }) => {
      if (id) {
        // `scritta_da` NON si riscrive correggendo: la riga deve
        // continuare a dire chi l'ha aperta, se no il titolare che
        // sistema un refuso si ritrova intestata la nota del tecnico.
        const { error } = await supabase
          .from('note_contabili')
          .update(dati)
          .eq('id', id)
          .eq('org_id', org!.id)
        if (error) throw error
        return id
      }

      const { data, error } = await supabase
        .from('note_contabili')
        .insert({ ...dati, org_id: org!.id, cantiere_id: cantiereId, scritta_da: app!.userId })
        .select('id')
        .single()
      if (error) throw error
      return data.id
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['note-contabili', v.cantiereId] })
    },
  })
}

export function useEliminaNota() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: { id: string; cantiereId: string }) => {
      const { error } = await supabase.from('note_contabili').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['note-contabili', v.cantiereId] })
    },
  })
}

/* ── ricerca ───────────────────────────────────────────────────── */

/**
 * Minuscole e senza accenti.
 *
 * Chi cerca scrive «perche», non «perché», e scrive di fretta dal
 * telefono in cantiere. Una ricerca che non trova «perché» perche' e'
 * stato digitato senza accento e' una ricerca che l'utente smette di
 * usare dopo due tentativi.
 */
function pulisci(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    // `\p{Diacritic}` invece del range dei segni combinanti scritto a
    // mano: quelli sono caratteri invisibili nel sorgente, e passando
    // da un editor all'altro si perdono senza che nessuno se ne accorga.
    .replace(/\p{Diacritic}/gu, '')
}

/**
 * Filtra le note su quello che si e' scritto nella casella di ricerca.
 *
 * Ogni parola cercata deve comparire da qualche parte — nella
 * descrizione, nelle note o nella data. E' l'AND e non l'OR: cercando
 * «nido muro» si vuole la nota che parla di tutti e due, non l'unione di
 * chi parla dell'uno o dell'altro.
 *
 * Tutto in memoria e non con una query: le note di un cantiere sono
 * decine, e una ricerca che parte a ogni tasto premuto deve rispondere
 * prima che il dito si alzi.
 */
export function filtra(note: NotaContabile[], cerca: string): NotaContabile[] {
  const parole = pulisci(cerca).split(/\s+/).filter(Boolean)
  if (parole.length === 0) return note

  return note.filter((n) => {
    const dove = pulisci(`${n.descrizione} ${n.note ?? ''} ${n.data}`)
    return parole.every((p) => dove.includes(p))
  })
}

export function sommaOre(note: NotaContabile[]): number {
  return note.reduce((t, n) => t + Number(n.ore), 0)
}
