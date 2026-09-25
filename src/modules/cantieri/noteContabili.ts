import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'

/* ══════════════════════════════════════════════════════════════════
   Le note contabili: i lavori extra di un cantiere.

   In edilizia il lavoro si paga a MISURA, sulle quantita' previste dal
   progetto. Cio' che il progetto non prevedeva si fattura a parte, e una
   nota contabile e' il posto dove il tecnico lo racconta: «rimozione del
   nido d'api trovato prima di alzare il muro».

   NIENTE ORE, ed e' una decisione dell'utente del 2026-09-15: la
   contabilita' dei lavori extra la fa lui a parte, fuori dal gestionale,
   e non passa dalle ore. Qui serve il TESTO — misure, calcoli, appunti,
   lavori a corpo — e il testo e' `descrizione`, libero e senza vincoli
   di formato, piu' `note` per il contorno.

   La colonna `ore` resta nello schema e non si scrive piu': e'
   `not null default 0`, quindi arriva zero da sola, senza migrazioni su
   un database condiviso con wbs-office e senza backup. Le righe vecchie
   restano leggibili, e se un domani le ore servissero la colonna e'
   ancora li'.

   Chi somma le ore per le paghe guarda `rapportino_ore`, e non ha mai
   dovuto toccare questa tabella.

   Tabella e policy in `supabase/schema/note-contabili.sql`.
   ══════════════════════════════════════════════════════════════════ */

export type NotaContabile = {
  id: string
  cantiere_id: string
  data: string
  descrizione: string
  note: string | null
  scritta_da: string | null
  created_at: string
}

const CAMPI = 'id, cantiere_id, data, descrizione, note, scritta_da, created_at'

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
// Generica: chi la chiama con le note arricchite del cantiere si
// riprende indietro quelle, non la versione spoglia.
export function filtra<T extends NotaContabile>(note: T[], cerca: string): T[] {
  const parole = pulisci(cerca).split(/\s+/).filter(Boolean)
  if (parole.length === 0) return note

  return note.filter((n) => {
    const dove = pulisci(`${n.descrizione} ${n.note ?? ''} ${n.data}`)
    return parole.every((p) => dove.includes(p))
  })
}

/* ── la raccolta, attraverso tutti i cantieri ──────────────────── */

export type NotaConCantiere = NotaContabile & {
  cantiere: { codice: string; denominazione: string } | null
  /** Quando e' stata segnata contabilizzata; `null` = non ancora. */
  contabilizzata_il: string | null
}

export type LavoriExtra = {
  note: NotaConCantiere[]
  /**
   * `false` finche' `note-contabili-contabilizzata.sql` non e' stato
   * eseguito: la colonna non esiste, e la pagina nasconde il flag
   * invece di cadere tutta con un errore.
   */
  conContabilizzazione: boolean
}

type RigaEconomia = NotaContabile & {
  cantieri: { codice: string; denominazione: string } | { codice: string; denominazione: string }[] | null
  contabilizzata_il?: string | null
}

const CAMPI_ECONOMIA =
  'id, cantiere_id, data, descrizione, note, scritta_da, created_at, cantieri ( codice, denominazione )'

/**
 * Tutti i lavori extra dell'azienda in un intervallo di date.
 *
 * Esiste perche' la domanda vera si fa un livello sopra il cantiere:
 * «cosa abbiamo fatto fuori progetto questo mese» e «cosa c'e' da
 * ribaltare al cliente». Cantiere per cantiere quella risposta si
 * ottiene solo aprendo sette pagine e leggendo a mano.
 *
 * Il perimetro lo decide la RLS e non questa query: il tecnico vede le
 * note dei cantieri suoi, chi ha `rapportini.read_all` le vede tutte.
 * Stessa pagina, due risposte diverse, e nessun `if` nel frontend.
 *
 * LA COLONNA DEL CONTABILIZZATO PUO' NON ESSERCI ANCORA (2026-09-25): lo
 * SQL si esegue a mano, e il frontend su Vercel puo' arrivare prima. Se
 * la prima lettura torna 42703 — colonna inesistente — si rilegge senza,
 * e la pagina funziona come prima.
 */
export function useOreEconomia(da: string, a: string) {
  const { org } = useSession()

  return useQuery({
    // Sotto ['note-contabili'] perche' chi salva una nota invalida quel
    // prefisso: senza, questa pagina resterebbe indietro.
    queryKey: ['note-contabili', 'economia', org?.id, da, a],
    enabled: Boolean(org?.id),
    queryFn: async (): Promise<LavoriExtra> => {
      const leggi = (campi: string) =>
        supabase
          .from('note_contabili')
          .select(campi)
          .eq('org_id', org!.id)
          .gte('data', da)
          .lte('data', a)
          .order('data', { ascending: false })

      let conContabilizzazione = true
      let risposta = await leggi(`${CAMPI_ECONOMIA}, contabilizzata_il`)
      if (risposta.error?.code === '42703') {
        conContabilizzazione = false
        risposta = await leggi(CAMPI_ECONOMIA)
      }
      if (risposta.error) throw risposta.error

      // La select e' composta a runtime, quindi i tipi di PostgREST non
      // la sanno leggere: la forma la si dichiara qui.
      const righe = (risposta.data ?? []) as unknown as RigaEconomia[]
      const note = righe.map((n): NotaConCantiere => {
        // PostgREST annida una relazione molti-a-uno come oggetto, ma i
        // tipi generati la danno a volte come array: si normalizza qui
        // invece di fidarsi, come si fa gia' altrove.
        const c = Array.isArray(n.cantieri) ? n.cantieri[0] : n.cantieri
        return {
          id: n.id,
          cantiere_id: n.cantiere_id,
          data: n.data,
          descrizione: n.descrizione,
          note: n.note,
          scritta_da: n.scritta_da,
          created_at: n.created_at,
          cantiere: c ? { codice: c.codice, denominazione: c.denominazione } : null,
          contabilizzata_il: n.contabilizzata_il ?? null,
        }
      })

      return { note, conContabilizzazione }
    },
  })
}

/**
 * Segna un lavoro extra come contabilizzato, o lo rimette fra quelli da
 * contabilizzare.
 *
 * Si scrive la DATA e chi l'ha segnato, non un si'/no: vedi
 * `note-contabili-contabilizzata.sql`. Togliendo il segno si svuotano
 * tutte e due, perche' una data rimasta li' direbbe il contrario del
 * flag.
 *
 * Chi puo' farlo lo decide la RLS: la stessa policy che lascia
 * correggere la nota — il tecnico sui cantieri suoi, il titolare
 * ovunque.
 */
export function useSegnaContabilizzata() {
  const { org, app } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, si }: { id: string; si: boolean }) => {
      const { data, error } = await supabase
        .from('note_contabili')
        .update(
          si
            ? { contabilizzata_il: new Date().toISOString(), contabilizzata_da: app!.userId }
            : { contabilizzata_il: null, contabilizzata_da: null },
        )
        .eq('id', id)
        .eq('org_id', org!.id)
        .select('id')
      if (error) throw error
      // La RLS che rifiuta un update non da' errore: aggiorna zero
      // righe. Senza questo controllo il pulsante direbbe «fatto» e la
      // riga tornerebbe com'era al primo aggiornamento.
      if (!data || data.length === 0) {
        throw new Error('non hai il permesso di segnare questo lavoro extra')
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['note-contabili'] })
    },
  })
}
