import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Avviso, Badge, Button, Card, cn } from '../../ui'
import { useSession } from '../auth/SessionProvider'
import { useRapportini, type Rapportino } from '../rapportini/useRapportini'
import { StatoRapportino } from '../rapportini/stato'
import { data as formattaData } from '../../lib/formato'

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
  const { app, org, can } = useSession()
  const { data: rapportini, isPending, error } = useRapportini()

  const puoValidare = can('rapportini.validate')
  const puoCompilare = can('rapportini.create')
  const vedeConti = can('economics.read')

  const tutti = rapportini ?? []
  const miei = tutti.filter((r) => r.compilato_da === app?.userId)

  // In attesa da piu' tempo per primi: la coda di chi valida si legge
  // dal piu' vecchio, non dal piu' recente.
  const daValidare = tutti
    .filter((r) => r.stato === 'inviato')
    .sort((a, b) => (a.inviato_at ?? '').localeCompare(b.inviato_at ?? ''))

  const daCorreggere = miei.filter((r) => r.stato === 'respinto')
  const bozze = miei.filter((r) => r.stato === 'bozza')
  const esitoRecente = miei
    .filter((r) => r.stato === 'validato' || r.stato === 'contabilizzato')
    .slice(0, 3)

  const daContabilizzare = tutti.filter((r) => r.stato === 'validato')

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-black">{org?.ragioneSociale}</h1>
        <p className="text-sm font-semibold text-gray-600">
          {app?.email} — <span className="lowercase">{org?.ruolo}</span>
          {app?.isPlatformAdmin && ' · staff di piattaforma'}
        </p>
      </div>

      {error && (
        <Avviso tono="errore">Non riesco a leggere i rapportini: {error.message}</Avviso>
      )}
      {isPending && <p className="text-sm font-bold text-gray-600">Carico la situazione…</p>}

      {!isPending && !error && (
        <div className="grid gap-6">
          {/* ── Chi valida: la coda in attesa ── */}
          {puoValidare && (
            <Riquadro
              titolo="Rapportini da validare"
              conteggio={daValidare.length}
              tono={daValidare.length > 0 ? 'attesa' : 'successo'}
              vuoto="Nessun rapportino in attesa. La coda è pulita."
              azione={{ etichetta: 'Tutti i rapportini', a: '/rapportini' }}
            >
              {daValidare.map((r) => (
                <Riga
                  key={r.id}
                  rapportino={r}
                  dettaglio={
                    r.inviato_at
                      ? `inviato il ${formattaData(r.inviato_at)}`
                      : 'in attesa'
                  }
                />
              ))}
            </Riquadro>
          )}

          {/* ── Chi compila: cosa e' tornato indietro, e perche' ── */}
          {puoCompilare && (
            <>
              <Riquadro
                titolo="Da correggere"
                conteggio={daCorreggere.length}
                tono={daCorreggere.length > 0 ? 'errore' : 'successo'}
                vuoto="Nessun rapportino respinto."
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

              {bozze.length > 0 && (
                <Riquadro
                  titolo="Bozze da inviare"
                  conteggio={bozze.length}
                  tono="neutro"
                  vuoto=""
                >
                  {bozze.map((r) => (
                    <Riga key={r.id} rapportino={r} dettaglio="non ancora inviato" />
                  ))}
                </Riquadro>
              )}

              {esitoRecente.length > 0 && daCorreggere.length === 0 && (
                <Riquadro titolo="Ultimi esiti" conteggio={null} tono="successo" vuoto="">
                  {esitoRecente.map((r) => (
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
