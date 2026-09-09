import { useNavigate } from 'react-router'
import { Avviso, Button, Card, cn } from '../../ui'
import { useCantieri } from '../cantieri/useCantieri'
import { useRapportini, type Rapportino } from '../rapportini/useRapportini'
import { oggi } from '../rapportini/campiRapportino'
import { data as formattaData } from '../../lib/formato'

/* ══════════════════════════════════════════════════════════════════
   La giornata del tecnico, un cantiere per card.

   La regola di Edily e' che la giornata si chiude solo quando OGNI
   cantiere attivo ha la sua scheda — anche quello dove non si e'
   lavorato, perche' "nessuna attivita'" e' un'informazione, non
   un'assenza di informazione. Finche' una casella e' rossa, il foglio
   di riepilogo della giornata non parte.

   Da qui il semaforo: non racconta lo stato del rapportino per
   curiosita', dice quanto manca alla fine della giornata.

     rosso   nessuna scheda: e' qui che va il tecnico adesso
     giallo  bozza aperta ma non inviata — l'errore piu' facile,
             perche' sembra fatto e non lo e'
     verde   inviata, la palla e' passata al titolare

   Guarda solo i cantieri `attivo`: uno sospeso o chiuso non chiede
   niente a nessuno, e tenerlo nell'elenco spegnerebbe il senso del
   contatore.
   ══════════════════════════════════════════════════════════════════ */

type Semaforo = 'rosso' | 'giallo' | 'verde'

const ASPETTO: Record<Semaforo, { punto: string; fascia: string; testo: string }> = {
  rosso: { punto: 'bg-rose-500', fascia: 'bg-rose-300', testo: 'Da compilare' },
  giallo: { punto: 'bg-yellow-400', fascia: 'bg-yellow-300', testo: 'Bozza da inviare' },
  verde: { punto: 'bg-lime-500', fascia: 'bg-lime-300', testo: 'Inviata' },
}

function semaforoDi(r: Rapportino | undefined): Semaforo {
  if (!r) return 'rosso'
  if (r.stato === 'bozza' || r.stato === 'respinto') return 'giallo'
  return 'verde'
}

export function CantieriDelGiorno() {
  const navigate = useNavigate()
  const giorno = oggi()

  const { data: cantieri, isPending: caricoCantieri, error: erroreCantieri } = useCantieri()
  const { data: rapportini, isPending: caricoRapportini } = useRapportini()

  if (caricoCantieri || caricoRapportini) {
    return <p className="text-sm font-bold text-gray-600">Carico la giornata…</p>
  }
  if (erroreCantieri) {
    return <Avviso tono="errore">Non riesco a leggere i cantieri: {erroreCantieri.message}</Avviso>
  }

  const attivi = (cantieri ?? []).filter((c) => c.stato === 'attivo')

  if (attivi.length === 0) {
    return (
      <Avviso tono="info">
        Nessun cantiere attivo assegnato a te: oggi non c&rsquo;è niente da compilare.
      </Avviso>
    )
  }

  // Il rapportino di OGGI per quel cantiere. Se per errore ce ne fosse
  // piu' d'uno vince quello piu' avanti nel flusso, cosi' una bozza
  // dimenticata non fa sembrare rossa una giornata gia' inviata.
  const ordine: Record<string, number> = {
    bozza: 0,
    respinto: 1,
    inviato: 2,
    validato: 3,
    contabilizzato: 4,
  }
  const diOggi = new Map<string, Rapportino>()
  for (const r of rapportini ?? []) {
    if (r.data !== giorno || !r.cantiere_id) continue
    const presente = diOggi.get(r.cantiere_id)
    if (!presente || ordine[r.stato] > ordine[presente.stato]) diOggi.set(r.cantiere_id, r)
  }

  const schede = attivi.map((c) => {
    const r = diOggi.get(c.id)
    return { cantiere: c, rapportino: r, semaforo: semaforoDi(r) }
  })

  const fatte = schede.filter((s) => s.semaforo === 'verde').length
  const complete = fatte === schede.length

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-black">
            La tua giornata — {formattaData(giorno)}
          </h2>
          <p className="text-xs font-semibold text-gray-600">
            Ogni cantiere attivo vuole la sua scheda, anche quelli fermi.
          </p>
        </div>

        <Avanzamento fatte={fatte} totale={schede.length} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {schede.map(({ cantiere, rapportino, semaforo }) => (
          <SchedaCantiere
            key={cantiere.id}
            codice={cantiere.codice}
            denominazione={cantiere.denominazione}
            luogo={
              cantiere.comune
                ? `${cantiere.comune}${cantiere.provincia ? ` (${cantiere.provincia})` : ''}`
                : null
            }
            semaforo={semaforo}
            onApri={() => {
              if (!rapportino) navigate(`/rapportini/nuovo?cantiere=${cantiere.id}&data=${giorno}`)
              else if (semaforo === 'giallo') navigate(`/rapportini/${rapportino.id}/modifica`)
              else navigate(`/rapportini/${rapportino.id}`)
            }}
          />
        ))}
      </div>

      {/* Il foglio di riepilogo non esiste ancora come documento: qui si
          dice solo se la condizione per inviarlo e' soddisfatta, cosi'
          il contatore ha un senso invece di essere un numero e basta. */}
      <Card
        className={cn(
          'flex flex-wrap items-center justify-between gap-3 p-4',
          complete ? 'bg-lime-100' : 'bg-white',
        )}
      >
        <p className="text-sm font-bold text-black">
          {complete
            ? 'Tutte le schede sono inviate: la giornata è completa.'
            : `Mancano ${schede.length - fatte} schede prima di poter chiudere la giornata.`}
        </p>
        <Button variante="primario" disabled title="Il foglio di riepilogo è in costruzione">
          Invia il foglio della giornata
        </Button>
      </Card>
    </div>
  )
}

/* ── pezzi ─────────────────────────────────────────────────────── */

function Avanzamento({ fatte, totale }: { fatte: number; totale: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1">
        {Array.from({ length: totale }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-2.5 w-6 rounded-full border-2 border-black',
              i < fatte ? 'bg-lime-400' : 'bg-white',
            )}
          />
        ))}
      </div>
      <span className="text-sm font-extrabold text-black">
        {fatte}/{totale}
      </span>
    </div>
  )
}

function SchedaCantiere({
  codice,
  denominazione,
  luogo,
  semaforo,
  onApri,
}: {
  codice: string
  denominazione: string
  luogo: string | null
  semaforo: Semaforo
  onApri: () => void
}) {
  const a = ASPETTO[semaforo]

  return (
    <Card className="overflow-hidden">
      <div className={cn('flex items-center gap-2 border-b-2 border-black px-4 py-2', a.fascia)}>
        <span className={cn('h-3 w-3 rounded-full border-2 border-black', a.punto)} />
        <span className="text-[11px] font-extrabold uppercase tracking-wide text-black">
          {a.testo}
        </span>
      </div>

      <div className="grid gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-gray-600">{codice}</p>
          <p className="truncate text-base font-extrabold leading-tight text-black">
            {denominazione}
          </p>
          {luogo && <p className="truncate text-xs font-semibold text-gray-600">{luogo}</p>}
        </div>

        <Button
          variante={semaforo === 'verde' ? undefined : 'primario'}
          dimensione="sm"
          onClick={onApri}
          className="w-full"
        >
          {semaforo === 'rosso' ? 'Compila' : semaforo === 'giallo' ? 'Riprendi' : 'Vedi'}
        </Button>
      </div>
    </Card>
  )
}
