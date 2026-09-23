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

/** La giornata di ore che il tecnico dichiara per se'.
 *
 *  Porta anche i NUMERI e non solo lo stato: sapere che le ore sono
 *  arrivate senza sapere quante non risponde alla domanda del titolare.
 *  Otto ore e quattro ore sono due giornate diverse, e un badge che
 *  dice solo «inviato» le fa sembrare la stessa cosa. */
export type ConsegnaOre = {
  data: string
  dipendente_id: string
  stato: string
  ore_ordinarie: number
  ore_straordinarie: number
  ore_assenza: number
  tipo_assenza: string | null
}

export type TecnicoInCampo = {
  dipendenteId: string
  userId: string
  nominativo: string
}

/* ── QUANTE SCHEDE ASPETTARSI, E DA CHI ─────────────────────────────

   Rifatto il 2026-09-22 dopo una domanda dell'utente sul calendario del
   titolare: «perche' ci sono tutti questi rossi quando il tecnico
   l'invio l'ha fatto? Forse e' stato creato un cantiere e tu in maniera
   retroattiva pretendi che il tecnico faccia rapportini dopo che
   l'invio e' stato fatto?»

   Era esattamente cosi'. Il denominatore era «quanti cantieri hanno
   stato attivo ADESSO» — un numero di stasera applicato all'indietro a
   tutto il mese. Due guasti in uno:

     RETROATTIVO   un cantiere aperto oggi rendeva rosse le giornate
                   della settimana scorsa, che erano complete. E ogni
                   cantiere nuovo riscriveva il giudizio su tutto il
                   passato: un calendario instabile, che accusa chi il
                   lavoro l'aveva fatto.
     DI CHIUNQUE   contava TUTTI gli attivi, anche quelli di un altro.
                   La verifica sui dati veri l'ha mostrato subito:
                   l'ottavo cantiere che mancava a Zito — Family Resort
                   — non e' mai stato suo, e' di Giuseppe come direttore
                   lavori.

   Adesso l'attesa si ricava da `cantiere_assegnazioni`, che ha gia' la
   forma della domanda: chi, su quale cantiere, da quando e fino a
   quando. Incrociata con le date del cantiere, perche' l'assegnazione
   da sola non basta — nei dati veri Monterosa risultava assegnato dal
   14 mentre il cantiere apriva il 17, e per tre giorni si sarebbero
   pretese schede di un cantiere chiuso. */
export type AttesaCantiere = {
  cantiereId: string
  userId: string
  /** Da quando quel cantiere e' in carico a quella persona. */
  dal: string
  /** Fino a quando, `null` se l'incarico e' ancora aperto. */
  al: string | null
  /** L'apertura del cantiere: prima di questa data non si lavora, per
   *  quanto l'incarico possa essere stato registrato in anticipo. */
  dataInizio: string | null
  /** La chiusura vera, non quella prevista: una fine prevista che passa
   *  non chiude un cantiere, e pretendere schede fino alla previsione
   *  invece che fino alla chiusura e' lo stesso errore all'incontrario. */
  dataFine: string | null
}

export type ConsegneDelMese = {
  tecnici: TecnicoInCampo[]
  rapportini: ConsegnaRapportino[]
  ore: ConsegnaOre[]
  attese: AttesaCantiere[]
  /** Chi e' segnato assente, per giorno (`assenze.sql`): «dipendente|data».
   *  Serve a non pretendere le ore proprie di un tecnico in ferie. */
  assenti: Set<string>
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
    // Sotto ['rapportini'] dal 2026-09-23: da quando ci legge anche il
    // calendario del tecnico, salvare o inviare una scheda deve
    // ricolorarlo subito, e ogni scrittura invalida gia' quel prefisso.
    queryKey: ['rapportini', 'consegne-mese', org?.id, dal],
    enabled: Boolean(org?.id),
    queryFn: async (): Promise<ConsegneDelMese> => {
      const [persone, schede, oreProprie, assegnazioni, assenze] = await Promise.all([
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
          .select(
            'data, dipendente_id, stato, ore_ordinarie, ore_straordinarie, ore_assenza, tipo_assenza',
          )
          .eq('org_id', org!.id)
          .gte('data', dal)
          .lte('data', al),
        /* NON filtrata per mese: un incarico aperto a maggio vale
           ancora a settembre, e restringerla al mese mostrato
           cancellerebbe proprio le assegnazioni di lunga durata — cioe'
           quasi tutte. Sono poche righe per impresa, si leggono
           intere. */
        supabase
          .from('cantiere_assegnazioni')
          .select('cantiere_id, user_id, dal, al, cantieri ( data_inizio, data_fine_effettiva )')
          .eq('org_id', org!.id),
        supabase
          .from('assenze')
          .select('dipendente_id, data')
          .eq('org_id', org!.id)
          .gte('data', dal)
          .lte('data', al),
      ])

      if (persone.error) throw persone.error
      if (schede.error) throw schede.error
      if (oreProprie.error) throw oreProprie.error
      if (assegnazioni.error) throw assegnazioni.error

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

      const attese: AttesaCantiere[] = (assegnazioni.data ?? []).map((a) => {
        const c = (Array.isArray(a.cantieri) ? a.cantieri[0] : a.cantieri) as
          | { data_inizio: string | null; data_fine_effettiva: string | null }
          | null
        return {
          cantiereId: a.cantiere_id,
          userId: a.user_id,
          dal: a.dal,
          al: a.al,
          dataInizio: c?.data_inizio ?? null,
          dataFine: c?.data_fine_effettiva ?? null,
        }
      })

      /* Le assenze NON fanno fallire il calendario: se `assenze.sql` non
         e' ancora stato eseguito la tabella non c'e', e il resto dei
         colori vale lo stesso. */
      const assenti = new Set(
        (assenze.error ? [] : (assenze.data ?? [])).map((x) => `${x.dipendente_id}|${x.data}`),
      )

      return {
        assenti,
        tecnici,
        rapportini: (schede.data ?? []) as unknown as ConsegnaRapportino[],
        ore: (oreProprie.data ?? []) as ConsegnaOre[],
        attese,
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

/**
 * Quanti rapportini aspettarsi da UNA persona in UN giorno.
 *
 * Il conto e' storico: vale il mondo com'era quel giorno, non com'e'
 * stasera. Un cantiere aperto oggi non colora il passato, e uno chiuso
 * la settimana scorsa non pretende schede da allora in poi.
 *
 * QUATTRO CONDIZIONI, e nessuna e' di troppo:
 *
 *   e' suo            l'assegnazione porta il `user_id`. Senza questa,
 *                     a Zito veniva chiesto Family Resort, che e' di
 *                     Giuseppe.
 *   l'aveva gia'      `dal <= giorno`. I tre cantieri presi in carico
 *                     il 21 non si pretendono il 17.
 *   non l'ha piu'     `al` assente o `>= giorno`.
 *   il cantiere era   `data_inizio <= giorno` e non ancora chiuso. Nei
 *   aperto            dati veri Monterosa risultava assegnato dal 14
 *                     mentre apriva il 17: l'incarico si registra anche
 *                     in anticipo, il lavoro no.
 *
 * ⚠️ UN CANTIERE SENZA `data_inizio` CONTA LO STESSO. Un dato mancante
 * non deve far sparire un'attesa: sparire sarebbe silenzioso, e una
 * giornata verde per un buco in anagrafica e' peggio di una rossa, che
 * almeno si vede. Comanda allora l'assegnazione, che c'e' sempre.
 */
export function cantieriAttesi(attese: AttesaCantiere[], userId: string, giorno: string): number {
  return attese.filter(
    (a) =>
      a.userId === userId &&
      a.dal <= giorno &&
      (a.al === null || a.al >= giorno) &&
      (a.dataInizio === null || a.dataInizio <= giorno) &&
      (a.dataFine === null || a.dataFine >= giorno),
  ).length
}

/** Le schede di quel tecnico, indicizzate per giorno.
 *
 *  Si filtra su `compilato_da`, che e' l'utente che ha scritto la
 *  scheda: e' l'unico legame fra una persona e cio' che ha consegnato.
 *  Una scheda scritta da qualcun altro sullo stesso cantiere non e' una
 *  sua consegna e non gli va accreditata. */
export function raggruppaPerGiorno(
  rapportini: ConsegnaRapportino[],
  tecnico: TecnicoInCampo,
): Map<string, ConsegnaRapportino[]> {
  const perGiorno = new Map<string, ConsegnaRapportino[]>()
  for (const r of rapportini) {
    if (r.compilato_da !== tecnico.userId) continue
    const gruppo = perGiorno.get(r.data)
    if (gruppo) gruppo.push(r)
    else perGiorno.set(r.data, [r])
  }
  return perGiorno
}

/** Le sue giornate di ore proprie, per data. Qui il legame e' il
 *  DIPENDENTE e non l'utente: `ore_personali` e' una riga di anagrafica
 *  del personale, non un documento scritto da un utente. */
export function oreDelTecnico(ore: ConsegnaOre[], tecnico: TecnicoInCampo): Map<string, ConsegnaOre> {
  const perGiorno = new Map<string, ConsegnaOre>()
  for (const o of ore) {
    if (o.dipendente_id !== tecnico.dipendenteId) continue
    perGiorno.set(o.data, o)
  }
  return perGiorno
}
