import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'

/* ══════════════════════════════════════════════════════════════════
   COSA DEVO ANCORA RICEVERE DAL CAMPO.

   Chiesto dall'utente il 2026-09-22, guardando la home del titolare:
   «voglio sapere, di tutti i cantieri che gli ho assegnato, se mi ha
   fatto i rapportini e quindi se mi ha inviato il foglio di giornata
   incluso delle sue ore».

   E' la domanda opposta a quella del tecnico. Il tecnico chiede «cosa
   mi manca da compilare»; il titolare chiede «cosa non mi e' ancora
   arrivato, e da chi». Stessa materia, due direzioni: per questo i dati
   si prendono qui e non riusando `useRapportini()`.

   ── PERCHE' UNA QUERY SUA, E PER MESE ───────────────────────────────

   `useRapportini()` si ferma a 200 righe su TUTTA l'impresa. Con cinque
   cantieri attivi e venti giorni lavorativi sono cento schede al mese:
   il tetto arriva al secondo mese, e sfogliando indietro il calendario
   direbbe «rosso, non e' arrivato niente» su giornate regolarmente
   consegnate. Un calendario che mente sul passato e' peggio di un
   calendario che non c'e', perche' si sollecita un tecnico che aveva
   fatto il suo lavoro.

   Quindi il perimetro e' il MESE mostrato: un mese di schede sta
   largamente dentro qualsiasi limite, e cambiando mese si ricarica.
   Sono due query leggere — solo le colonne che servono al colore, non
   le ore ne' le foto.

   ── CHI SONO I TECNICI ──────────────────────────────────────────────

   Si parte dall'anagrafica, non dai rapportini: `dipendenti` con
   `tipo = 'tecnico'`, attivi, e con un `user_id` collegato. Il
   collegamento e' obbligatorio perche' e' l'unico ponte fra una persona
   e cio' che ha scritto — i rapportini portano `compilato_da`, che e'
   un utente, non un dipendente.

   Partire dall'anagrafica e non da chi ha compilato e' la differenza
   fra le due domande: un tecnico che non ha mandato NIENTE per tutto il
   mese dai rapportini non emergerebbe affatto — sparirebbe proprio il
   caso che il titolare deve vedere.
   ══════════════════════════════════════════════════════════════════ */

/** Una scheda arrivata (o non arrivata) dal campo, ridotta all'osso. */
export type ConsegnaRapportino = {
  id: string
  data: string
  cantiere_id: string
  stato: string
  compilato_da: string | null
  /** Il nome del cantiere, annidato da PostgREST attraverso la chiave
   *  esterna. Serve al dettaglio del giorno: sette righe che dicono
   *  tutte «Scheda · validato» non si distinguono l'una dall'altra, e
   *  la domanda del titolare e' proprio QUALE cantiere manca. */
  cantieri: { codice: string; denominazione: string } | null
}

/** La giornata di ore che il tecnico dichiara per se'. */
export type ConsegnaOre = {
  data: string
  dipendente_id: string
  stato: string
}

export type TecnicoInCampo = {
  dipendenteId: string
  userId: string
  nominativo: string
}

export type ConsegneDelMese = {
  tecnici: TecnicoInCampo[]
  rapportini: ConsegnaRapportino[]
  ore: ConsegnaOre[]
}

/** Il primo e l'ultimo giorno del mese che contiene `giorno`.
 *
 *  L'ultimo si ricava come «giorno 0 del mese successivo», che Date
 *  risolve nell'ultimo del mese corrente senza tabelle di lunghezze e
 *  senza casi speciali per febbraio bisestile. */
function estremiDelMese(giorno: string): { dal: string; al: string } {
  const [a, m] = giorno.slice(0, 10).split('-').map(Number)
  const ultimo = new Date(a, m, 0).getDate()
  const mm = String(m).padStart(2, '0')
  return { dal: `${a}-${mm}-01`, al: `${a}-${mm}-${String(ultimo).padStart(2, '0')}` }
}

/**
 * Tutto cio' che serve a colorare il mese, per ogni tecnico in campo.
 *
 * Le tre query vanno insieme perche' rispondono a una domanda sola, e
 * separarle vorrebbe dire tre stati di caricamento da comporre in
 * pagina per disegnare una griglia che ha senso solo intera.
 *
 * La RLS ha gia' filtrato: chi valida vede tutta l'impresa, e questo
 * riquadro lo vede solo chi valida.
 */
export function useConsegneDelMese(giorno: string) {
  const { org } = useSession()
  const { dal, al } = estremiDelMese(giorno)

  return useQuery({
    // Il mese nella chiave, non il giorno: sfogliare da lunedi' a
    // martedi' non deve rifare le query, e' lo stesso mese di dati.
    queryKey: ['consegne-mese', org?.id, dal],
    enabled: Boolean(org?.id),
    queryFn: async (): Promise<ConsegneDelMese> => {
      const [persone, schede, oreProprie] = await Promise.all([
        supabase
          .from('dipendenti')
          .select('id, nome, cognome, user_id')
          .eq('org_id', org!.id)
          .eq('tipo', 'tecnico')
          .eq('attivo', true)
          .order('cognome'),
        supabase
          .from('rapportini')
          .select('id, data, cantiere_id, stato, compilato_da, cantieri ( codice, denominazione )')
          .eq('org_id', org!.id)
          .gte('data', dal)
          .lte('data', al)
          .order('data', { ascending: true }),
        supabase
          .from('ore_personali')
          .select('data, dipendente_id, stato')
          .eq('org_id', org!.id)
          .gte('data', dal)
          .lte('data', al),
      ])

      if (persone.error) throw persone.error
      if (schede.error) throw schede.error
      if (oreProprie.error) throw oreProprie.error

      const tecnici: TecnicoInCampo[] = (persone.data ?? [])
        // Senza `user_id` non si puo' dire cosa ha scritto: la sua
        // colonna resterebbe rossa per sempre, accusandolo di non
        // consegnare quando il buco e' nell'anagrafica. Meglio non
        // mostrarlo affatto — e la pagina lo dice, vedi il componente.
        .filter((p) => p.user_id)
        .map((p) => ({
          dipendenteId: p.id,
          userId: p.user_id as string,
          nominativo: `${p.cognome} ${p.nome}`.trim(),
        }))

      return {
        tecnici,
        rapportini: (schede.data ?? []) as unknown as ConsegnaRapportino[],
        ore: (oreProprie.data ?? []) as ConsegnaOre[],
      }
    },
  })
}

/** I tecnici in anagrafica ancora SENZA utente collegato.
 *
 *  Si contano a parte perche' sono un difetto da segnalare, non una
 *  persona da colorare: finche' il collegamento manca, di quella
 *  persona il programma non sa dire niente. */
export function useTecniciScollegati() {
  const { org } = useSession()

  return useQuery({
    queryKey: ['tecnici-scollegati', org?.id],
    enabled: Boolean(org?.id),
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('dipendenti')
        .select('nome, cognome, user_id')
        .eq('org_id', org!.id)
        .eq('tipo', 'tecnico')
        .eq('attivo', true)
        .is('user_id', null)

      if (error) throw error
      return (data ?? []).map((p) => `${p.cognome} ${p.nome}`.trim())
    },
  })
}
