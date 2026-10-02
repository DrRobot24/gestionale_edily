import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'

/* ══════════════════════════════════════════════════════════════════
   I TICKET, dal 2026-10-02: il titolare e il tecnico si scrivono.

   «Serve una strada per far comunicare il titolare con il tecnico [...]
   un sistema tipo quello dei ticket, dove il titolare puo' dire al
   tecnico: ehi ricordati di aggiungere il sale, e poi cosi' lui lo fa»
   (utente). E' la strada per dire le cose PRIMA di validare: da quando
   validare e' definitivo, il «Riapri» del rapportino non c'e' piu'.

   Un ticket: oggetto, primo messaggio, risposte; cantiere e giorno
   facoltativi; aperto finche' qualcuno lo segna fatto. Lo vedono solo i
   due che si scrivono — chi valida e chi compila, a vicenda; e dallo
   stesso giorno chi valida e chi fa le paghe, perche' il Riepilogo
   firmato non si riapre piu' e le cose vanno dette prima. Le regole
   stanno nel database, `ticket.sql` e `ticket-amministrazione.sql`.

   «DA LEGGERE» e «DA FARE» sono le due cose che la home e il menu
   chiedono: l'ultimo messaggio e' dell'altro e non l'ho ancora aperto;
   il ticket e' indirizzato a me ed e' ancora aperto.
   ══════════════════════════════════════════════════════════════════ */

export type StatoTicket = 'aperto' | 'fatto'

export type Ticket = {
  id: string
  numero: number
  oggetto: string
  da_user: string
  a_user: string
  cantiere_id: string | null
  giorno: string | null
  stato: StatoTicket
  fatto_at: string | null
  fatto_da: string | null
  ultimo_messaggio_at: string
  ultimo_autore: string | null
  letto_da_mittente_at: string | null
  letto_da_destinatario_at: string | null
  created_at: string
  cantiere: { codice: string; denominazione: string } | null
}

export type Messaggio = {
  id: string
  autore: string
  testo: string
  created_at: string
}

const CAMPI =
  'id, numero, oggetto, da_user, a_user, cantiere_id, giorno, stato, fatto_at, fatto_da, ' +
  'ultimo_messaggio_at, ultimo_autore, letto_da_mittente_at, letto_da_destinatario_at, created_at, ' +
  'cantiere:cantieri(codice, denominazione)'

/** Le tabelle o le funzioni non ci sono ancora: lo SQL non e' stato eseguito. */
export function ticketMancanti(e: unknown): boolean {
  const c = (e as { code?: string } | null)?.code
  return c === '42P01' || c === 'PGRST205' || c === 'PGRST202'
}

function spiega(e: { code?: string; message: string }): Error {
  if (ticketMancanti(e)) {
    return new Error('Manca il database dei ticket: va eseguito supabase/schema/ticket.sql.')
  }
  return new Error(e.message)
}

/** Chi puo' usare i ticket: chi valida, chi compila, chi fa le paghe.
 *  A chi puo' scrivere ciascuno lo dice `ticket_persone`. */
export function usePuoTicket(): boolean {
  const { can } = useSession()
  return can('rapportini.validate') || can('rapportini.create') || can('paghe.read')
}

/** L'ultimo messaggio e' dell'altro, e io non l'ho ancora letto. */
export function daLeggere(t: Ticket, io: string | undefined): boolean {
  if (!io || t.ultimo_autore === io) return false
  const letto = io === t.da_user ? t.letto_da_mittente_at : t.letto_da_destinatario_at
  return !letto || Date.parse(t.ultimo_messaggio_at) > Date.parse(letto)
}

/** Indirizzato a me, e ancora aperto. */
export function daFare(t: Ticket, io: string | undefined): boolean {
  return Boolean(io) && t.stato === 'aperto' && t.a_user === io
}

/** Le persone dell'impresa coi nomi, e a chi posso scrivere. */
export function useTicketPersone() {
  const { org } = useSession()
  const puo = usePuoTicket()

  return useQuery({
    queryKey: ['ticket', 'persone', org?.id],
    enabled: Boolean(org?.id) && puo,
    retry: false,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('ticket_persone', { p_org: org!.id })
      if (error) {
        if (ticketMancanti(error)) return new Map<string, { nome: string; destinatario: boolean }>()
        throw spiega(error)
      }
      return new Map((data ?? []).map((p) => [p.user_id, { nome: p.nome, destinatario: p.destinatario }]))
    },
  })
}

/** Tutti i miei ticket — quelli che ho aperto e quelli che ho ricevuto
 *  (la RLS non ne mostra altri), dall'ultimo che si e' mosso. */
export function useTicketMiei() {
  const { org } = useSession()
  const puo = usePuoTicket()

  return useQuery({
    queryKey: ['ticket', 'elenco', org?.id],
    enabled: Boolean(org?.id) && puo,
    retry: false,
    // Un messaggio nuovo compare anche senza ricaricare la pagina.
    refetchInterval: 60_000,
    queryFn: async (): Promise<{ righe: Ticket[]; mancante: boolean }> => {
      const { data, error } = await supabase
        .from('ticket')
        .select(CAMPI)
        .eq('org_id', org!.id)
        .order('ultimo_messaggio_at', { ascending: false })
      if (error) {
        if (ticketMancanti(error)) return { righe: [], mancante: true }
        throw spiega(error)
      }
      return { righe: (data ?? []) as unknown as Ticket[], mancante: false }
    },
  })
}

/** Quanti ticket chiedono qualcosa a me: per il pallino del menu. */
export function useTicketDaVedere(): number {
  const { app } = useSession()
  const { data } = useTicketMiei()
  return (data?.righe ?? []).filter((t) => daLeggere(t, app?.userId) || daFare(t, app?.userId)).length
}

export function useTicketScheda(id: string | undefined) {
  const { org } = useSession()

  return useQuery({
    queryKey: ['ticket', 'scheda', id],
    enabled: Boolean(id && org?.id),
    retry: false,
    refetchInterval: 30_000,
    queryFn: async (): Promise<{ ticket: Ticket; messaggi: Messaggio[] }> => {
      const [t, m] = await Promise.all([
        supabase.from('ticket').select(CAMPI).eq('id', id!).eq('org_id', org!.id).single(),
        supabase
          .from('ticket_messaggi')
          .select('id, autore, testo, created_at')
          .eq('ticket_id', id!)
          .order('created_at', { ascending: true }),
      ])
      if (t.error) throw spiega(t.error)
      if (m.error) throw spiega(m.error)
      return { ticket: t.data as unknown as Ticket, messaggi: (m.data ?? []) as Messaggio[] }
    },
  })
}

export type NuovoTicket = {
  a_user: string
  oggetto: string
  testo: string
  cantiere_id: string | null
  giorno: string | null
}

/** Il ticket e il primo messaggio insieme (`apri_ticket`): l'id nuovo. */
export function useApriTicket() {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (n: NuovoTicket): Promise<string> => {
      const { data, error } = await supabase.rpc('apri_ticket', {
        p_org: org!.id,
        p_a_user: n.a_user,
        p_oggetto: n.oggetto,
        p_testo: n.testo,
        p_cantiere: n.cantiere_id,
        p_giorno: n.giorno,
      })
      if (error) throw spiega(error)
      return data as string
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket'] }),
  })
}

export function useRispondi(ticketId: string) {
  const { org } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (testo: string) => {
      const { error } = await supabase
        .from('ticket_messaggi')
        .insert({ org_id: org!.id, ticket_id: ticketId, testo })
      if (error) throw spiega(error)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket'] }),
  })
}

export function useStatoTicket(ticketId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (stato: StatoTicket) => {
      const { error } = await supabase.from('ticket').update({ stato }).eq('id', ticketId)
      if (error) throw spiega(error)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket'] }),
  })
}

/** Segna letto il ticket, per la mia parte: mittente o destinatario.
 *  L'ora la rimette il database (`ticket_cambia`): qui basta cambiarla. */
export function useSegnaLetto() {
  const { app } = useSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (t: Ticket) => {
      const adesso = new Date().toISOString()
      const { error } = await supabase
        .from('ticket')
        .update(
          app?.userId === t.da_user
            ? { letto_da_mittente_at: adesso }
            : { letto_da_destinatario_at: adesso },
        )
        .eq('id', t.id)
      if (error) throw spiega(error)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket', 'elenco'] }),
  })
}
