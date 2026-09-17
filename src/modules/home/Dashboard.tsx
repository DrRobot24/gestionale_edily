import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Avviso, Badge, Button, Card, cn } from '../../ui'
import { useSession } from '../auth/SessionProvider'
import { useRapportini, type Rapportino } from '../rapportini/useRapportini'
import { StatoRapportino } from '../rapportini/stato'
import { data as formattaData, giornoPiu } from '../../lib/formato'
import { useCantieri } from '../cantieri/useCantieri'
import { Benvenuto } from './Benvenuto'
import { CalendarioGiornate } from './CalendarioGiornate'
import { CantieriDelGiorno } from './CantieriDelGiorno'
import { ControlloOre } from './ControlloOre'
import { MieOre } from './MieOre'
import { GiornateDaValidare } from './GiornateDaValidare'
import { IlSuoLavoro } from './IlSuoLavoro'
import { oggi } from '../rapportini/campiRapportino'

/* ══════════════════════════════════════════════════════════════════
   La home mostra cosa aspetta TE, non cosa sai fare.

   Prima qui c'era l'elenco dei permessi attivi: una schermata di
   diagnostica, utile mentre si costruiva il modello dei ruoli e inutile
   a chi deve lavorare. Chi apre il gestionale la mattina ha una sola
   domanda — "cosa devo fare adesso" — e la risposta cambia col ruolo:

     chi valida    i rapportini che aspettano una firma
     chi compila   quelli respinti, col motivo, e le bozze ferme
     chi contabilizza  quelli validati che non sono ancora entrati nei conti

   Le sezioni si accendono sui PERMESSI, non sui ruoli: e' la stessa
   regola del menu, e vuol dire che aggiungere un permesso a un ruolo fa
   comparire la sezione senza toccare questo file.

   Nessuna query nuova: tutto esce da useRapportini(), che la RLS ha gia'
   filtrato per azienda e per cantieri di competenza.
   ══════════════════════════════════════════════════════════════════ */

export function Dashboard() {
  const { app, can } = useSession()
  const { data: rapportini, isPending, error } = useRapportini()

  /* Il giorno guardato vive QUI e non dentro le card, perche' e' uno
     solo per tutta la pagina: le frecce, le schede dei cantieri, il
     controllo delle ore e il calendario devono parlare dello stesso
     giorno. Tenerlo in ognuno di loro vorrebbe dire quattro idee di
     «oggi» che si separano al primo click. */
  const { data: cantieri } = useCantieri()

  /* IL DEFAULT NON E' SEMPRE OGGI, ed e' la prassi vera di Edily detta
     dall'utente il 2026-09-15: il tecnico compila OGGI il giorno
     PRECEDENTE — raccoglie le informazioni in giro per i cantieri e la
     sera o la mattina dopo le scrive. Il giorno corrente lo rapporta di
     rado, e mai due giorni indietro.

     Aprire sempre su oggi voleva dire un click di correzione ogni
     mattina, per anni, per tutti. Ora si apre su IERI se ieri e'
     rimasto incompleto, su oggi se ieri e' a posto.

     Il giorno e' DERIVATO, non impostato da un effetto: `scelta` resta
     null finche' nessuno tocca le frecce, e il suggerimento si ricalcola
     dai dati. Con un `useEffect` che chiamava `setGiorno` il lint
     segnalava render a cascata — ed era giusto: qui non serve un
     effetto, serve un valore. */
  const [scelta, setScelta] = useState<string | null>(null)
  const giorno = scelta ?? suggerisciGiorno(rapportini, cantieri)
  const setGiorno = setScelta

  const puoValidare = can('rapportini.validate')
  const puoCompilare = can('rapportini.create')

  const tutti = rapportini ?? []
  const miei = tutti.filter((r) => r.compilato_da === app?.userId)

  const daCorreggere = miei.filter((r) => r.stato === 'respinto')

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      {/* Le frecce stanno nella fascia, ai lati della data: la data
          grande e' il titolo della pagina, e il posto per cambiarla e'
          quello dove la si legge. Chi non compila la riceve senza
          frecce — sfogliare le giornate del tecnico non gli serve. */}
      {puoCompilare ? <Benvenuto giorno={giorno} onCambia={setGiorno} /> : <Benvenuto />}

      {error && (
        <Avviso tono="errore">Non riesco a leggere i rapportini: {error.message}</Avviso>
      )}
      {isPending && <p className="text-sm font-bold text-gray-600">Carico la situazione…</p>}

      {!isPending && !error && (
        <div className="grid gap-6">
          {/* ── Chi valida: le giornate, non le schede sciolte ── */}
          {puoValidare && <GiornateDaValidare />}

          {/* ── Chi compila: prima la giornata, poi le code ── */}
          {puoCompilare && (
            <>
              <CantieriDelGiorno giorno={giorno} />

              {/* Il calendario sta SOTTO le card e SOPRA le code, e la
                  posizione e' ragionata. Sopra le card no: chi apre
                  l'app alle sette deve incontrare cosa fare adesso, non
                  una griglia di quaranta caselle da interpretare — e le
                  frecce nella fascia fanno gia' il gesto quotidiano,
                  che con la prassi «oggi per ieri» e' un passo solo.
                  Dentro la sequenza card → invio nemmeno: spezzerebbe
                  in due il «guarda le schede, poi mandale». Qui e' il
                  contesto che viene dopo il presente.

                  TRE COLONNE, e non e' una scelta estetica. Da solo, il
                  calendario stretto lasciava mezza riga bianca — «è
                  follia», ha detto l'utente, e aveva ragione: in una
                  dashboard uno spazio vuoto e' spazio che qualcuno ha
                  dimenticato di usare.

                  I tre riquadri rispondono a tre domande diverse sullo
                  stesso giorno, e per questo stanno affiancati invece
                  che in fila: dove sto nel mese, quante ore ha fatto la
                  squadra, quante ne ho fatte io. Sul telefono si
                  impilano in quest'ordine. */}
              <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
                <CalendarioGiornate giorno={giorno} onScegli={setGiorno} />
                <ControlloOre giorno={giorno} />
                {/* Le ore di chi compila. Erano l'unica cosa che la
                    giornata non diceva: il tecnico passa in cantiere e
                    lavora come tutti, ma finora le sue ore comparivano
                    solo come divieto accanto al pulsante di invio, e
                    solo a giornata gia' completa. */}
                <MieOre giorno={giorno} />
              </div>

              {/* `vuoto` vuota di proposito: senza righe il riquadro
                  sparisce del tutto. Un pannello verde permanente che
                  dice "nessun rapportino respinto" occupa mezza
                  schermata per annunciare che non e' successo niente, e
                  insegna a saltare con l'occhio proprio la zona dove un
                  giorno comparira' la cosa urgente. L'assenza del rosso
                  e' gia' il messaggio. */}
              <Riquadro
                titolo="Da correggere"
                conteggio={daCorreggere.length}
                tono="errore"
                vuoto=""
              >
                {daCorreggere.map((r) => (
                  <Riga
                    key={r.id}
                    rapportino={r}
                    // Il motivo e' il punto di tutta la sezione: senza,
                    // "respinto" e' una porta chiusa senza spiegazione.
                    dettaglio={r.motivo_rifiuto ?? 'respinto senza motivo indicato'}
                    evidenzia
                  />
                ))}
              </Riquadro>

            </>
          )}

          {/* ── Chi tiene i registri: le anagrafiche, non i rapportini ──

              Qui c'era «Validati, non ancora in contabilità», una coda
              di RAPPORTINI. Tolta il 2026-09-17 su indicazione
              dell'utente, ed e' la stessa decisione del 2026-09-15 che
              li ha tolti dal menu di Stefania, arrivata fin qui: il
              rapportino e' il documento di chi compila in cantiere, e a
              chi tiene l'amministrazione non dice niente su cosa deve
              fare adesso. Elencarli in home era chiederle di guardare
              ogni mattina una lista su cui non ha nessuna azione.

              Al suo posto il punto di partenza del suo lavoro vero: i
              registri che riempie lei, con quanti ne ha dentro. */}
          <IlSuoLavoro />
        </div>
      )}
    </div>
  )
}

/* ── pezzi ─────────────────────────────────────────────────────── */

/**
 * Il giorno su cui aprire la home, quando nessuno ha ancora scelto.
 *
 * Ieri se ieri e' rimasto incompleto — mancano schede, o ce n'e' una in
 * bozza o respinta — altrimenti oggi. Segue la prassi: si compila oggi
 * per ieri.
 *
 * Mentre i dati non ci sono ancora risponde oggi, che e' la risposta
 * giusta da dare senza informazioni: il caso «ieri e' rimasto aperto»
 * e' l'eccezione da riconoscere, non il punto di partenza da
 * indovinare.
 */
function suggerisciGiorno(
  rapportini: Rapportino[] | undefined,
  cantieri: { stato: string }[] | undefined,
): string {
  const adesso = oggi()
  if (!rapportini || !cantieri) return adesso

  const ieri = giornoPiu(adesso, -1)
  const attivi = cantieri.filter((c) => c.stato === 'attivo').length
  const diIeri = rapportini.filter((r) => r.data === ieri)

  const incompleto =
    diIeri.length < attivi || diIeri.some((r) => r.stato === 'bozza' || r.stato === 'respinto')

  return incompleto ? ieri : adesso
}

type Tono = 'attesa' | 'errore' | 'successo' | 'info' | 'neutro'

const BORDI: Record<Tono, string> = {
  attesa: 'bg-yellow-300',
  errore: 'bg-rose-300',
  successo: 'bg-lime-300',
  info: 'bg-sky-300',
  neutro: 'bg-white',
}

function Riquadro({
  titolo,
  conteggio,
  tono,
  vuoto,
  azione,
  children,
}: {
  titolo: string
  conteggio: number | null
  tono: Tono
  vuoto: string
  azione?: { etichetta: string; a: string }
  children: ReactNode
}) {
  const navigate = useNavigate()
  const righe = Array.isArray(children) ? children.flat() : [children]
  const pieno = righe.filter(Boolean).length > 0

  if (!pieno && !vuoto) return null

  return (
    <Card className="overflow-hidden">
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-3 border-b-2 border-black px-5 py-3',
          BORDI[tono],
        )}
      >
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-black">{titolo}</h2>
          {conteggio !== null && (
            <span className="rounded-full border-2 border-black bg-white px-2.5 py-0.5 text-xs font-extrabold">
              {conteggio}
            </span>
          )}
        </div>
        {azione && (
          <Button dimensione="sm" onClick={() => navigate(azione.a)}>
            {azione.etichetta}
          </Button>
        )}
      </div>

      {pieno ? (
        <ul className="divide-y-2 divide-black">{children}</ul>
      ) : (
        <p className="px-5 py-4 text-sm font-semibold text-gray-600">{vuoto}</p>
      )}
    </Card>
  )
}

function Riga({
  rapportino: r,
  dettaglio,
  evidenzia = false,
}: {
  rapportino: Rapportino
  dettaglio: string
  evidenzia?: boolean
}) {
  const navigate = useNavigate()
  const cantiere = Array.isArray(r.cantieri) ? r.cantieri[0] : r.cantieri

  return (
    <li>
      <button
        type="button"
        onClick={() => navigate(`/rapportini/${r.id}`)}
        className="neo-press flex w-full cursor-pointer flex-wrap items-center justify-between gap-3 px-5 py-3 text-left hover:bg-amber-50"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-black">
            {cantiere?.codice ? `${cantiere.codice} — ` : ''}
            {cantiere?.denominazione ?? 'Cantiere non indicato'}
          </p>
          <p
            className={cn(
              'truncate text-xs font-semibold',
              evidenzia ? 'text-rose-700' : 'text-gray-600',
            )}
          >
            {formattaData(r.data)} · {dettaglio}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {r.numero && (
            <Badge className="px-2 py-0.5 text-[10px]">
              n. {r.numero}/{r.anno}
            </Badge>
          )}
          <StatoRapportino stato={r.stato} />
        </div>
      </button>
    </li>
  )
}
