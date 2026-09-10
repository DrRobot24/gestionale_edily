import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Avviso, Badge, Button, Card, cn } from '../../ui'
import { useSession } from '../auth/SessionProvider'
import { useRapportini, type Rapportino } from '../rapportini/useRapportini'
import { StatoRapportino } from '../rapportini/stato'
import { data as formattaData } from '../../lib/formato'
import { Benvenuto } from './Benvenuto'
import { CantieriDelGiorno } from './CantieriDelGiorno'
import { GiornateAperte } from './GiornateAperte'
import { GiornateDaValidare } from './GiornateDaValidare'

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

  const puoValidare = can('rapportini.validate')
  const puoCompilare = can('rapportini.create')

  // Stessa separazione dei compiti applicata al pulsante "Contabilizza"
  // in RapportinoPage: chi approva non registra. Per il titolare la coda
  // della contabilita' non e' un suo compito, e questa home mostra
  // quello che aspetta te - non tutto quello che potresti guardare.
  const vedeConti = can('economics.read') && !puoValidare

  const tutti = rapportini ?? []
  const miei = tutti.filter((r) => r.compilato_da === app?.userId)

  const daCorreggere = miei.filter((r) => r.stato === 'respinto')

  const daContabilizzare = tutti.filter((r) => r.stato === 'validato')

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <Benvenuto />

      {error && (
        <Avviso tono="errore">Non riesco a leggere i rapportini: {error.message}</Avviso>
      )}
      {isPending && <p className="text-sm font-bold text-gray-600">Carico la situazione…</p>}

      {!isPending && !error && (
        <div className="grid gap-6">
          {/* ── Chi valida: le giornate, non le schede sciolte ── */}
          {puoValidare && <GiornateDaValidare />}

          {/* ── Chi compila: prima la giornata di oggi, poi le code ── */}
          {puoCompilare && (
            <>
              <CantieriDelGiorno />

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

              {/* Le giornate dei giorni scorsi rimaste a meta'. Ha
                  preso il posto di "Bozze da inviare", che prometteva un
                  invio singolo non piu' esistente, e di "Ultimi esiti",
                  che mostrava al tecnico cose gia' andate bene: una
                  bacheca dei complimenti, non qualcosa che aspetta lui.
                  Questa home dice cosa devi fare adesso. */}
              <GiornateAperte />
            </>
          )}

          {/* ── Chi tiene i conti ── */}
          {vedeConti && (
            <Riquadro
              titolo="Validati, non ancora in contabilità"
              conteggio={daContabilizzare.length}
              tono={daContabilizzare.length > 0 ? 'info' : 'successo'}
              vuoto="Niente in attesa di essere contabilizzato."
              azione={{ etichetta: 'Vai a Economia', a: '/economia' }}
            >
              {daContabilizzare.slice(0, 6).map((r) => (
                <Riga
                  key={r.id}
                  rapportino={r}
                  dettaglio={
                    r.validato_at ? `validato il ${formattaData(r.validato_at)}` : 'validato'
                  }
                />
              ))}
            </Riquadro>
          )}
        </div>
      )}
    </div>
  )
}

/* ── pezzi ─────────────────────────────────────────────────────── */

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
