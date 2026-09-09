import { useNavigate } from 'react-router'
import { Avviso, Badge, Card, cn } from '../../ui'
import {
  useDaValidare,
  oreDi,
  presentiDi,
  type SchedaDaValidare,
} from '../rapportini/useDaValidare'
import { dataEstesa, numero as formattaNumero } from '../../lib/formato'

/* ══════════════════════════════════════════════════════════════════
   La coda del titolare, a volo d'uccello.

   Prima le schede arrivavano in un elenco unico ordinato per data: con
   sette cantieri diventava una lista lunga in cui non si capiva dove
   finisse una giornata e cominciasse l'altra. Ma da quando il tecnico
   manda il Foglio Riepilogativo di Giornata, l'unita' di lettura non e'
   piu' la scheda: e' il giorno.

   Quindi prima il colpo d'occhio - quante schede, quante ore, quali
   cantieri - e solo dopo, se vuole, si entra dentro una singola scheda
   per leggerla e firmarla. La validazione resta granulare: qui non si
   valida niente in blocco, si decide dove guardare.
   ══════════════════════════════════════════════════════════════════ */

export function GiornateDaValidare() {
  const navigate = useNavigate()
  const { data: schede, isPending, error } = useDaValidare()

  if (isPending) return <p className="text-sm font-bold text-gray-600">Carico le giornate…</p>
  if (error) {
    return <Avviso tono="errore">Non riesco a leggere le schede: {error.message}</Avviso>
  }

  if (!schede || schede.length === 0) {
    return (
      <Card className="p-5">
        <h2 className="mb-1 text-lg font-extrabold text-black">Da validare</h2>
        <p className="text-sm font-semibold text-gray-600">
          Nessuna giornata in attesa. La coda è pulita.
        </p>
      </Card>
    )
  }

  // Raggruppa per data conservando l'ordine di arrivo, che la query ha
  // gia' messo dal giorno piu' recente.
  const giornate = new Map<string, SchedaDaValidare[]>()
  for (const s of schede) {
    const gruppo = giornate.get(s.data)
    if (gruppo) gruppo.push(s)
    else giornate.set(s.data, [s])
  }

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-lg font-extrabold text-black">Giornate da validare</h2>
        <p className="text-xs font-semibold text-gray-600">
          Il quadro d&rsquo;insieme. Apri una scheda quando vuoi entrare nel dettaglio.
        </p>
      </div>

      {[...giornate.entries()].map(([giorno, delGiorno]) => {
        const ore = delGiorno.reduce((t, s) => t + oreDi(s), 0)
        const ferme = delGiorno.filter((s) => s.nessuna_attivita).length

        return (
          <Card key={giorno} className="overflow-hidden">
            {/* La data e' il titolo del riquadro, non una didascalia:
                e' l'unita' di lettura del titolare da quando riceve
                giornate intere invece di schede sciolte. */}
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-black bg-yellow-300 px-5 py-3">
              <h3 className="text-xl font-extrabold capitalize leading-tight text-black">
                {dataEstesa(giorno)}
              </h3>
              <p className="text-xs font-bold text-black/70">
                {delGiorno.length} {delGiorno.length === 1 ? 'scheda' : 'schede'}
                {' · '}
                <span className="numerico">{formattaNumero(ore)}</span> ore
                {ferme > 0 && ` · ${ferme} senza attività`}
              </p>
            </div>

            <ul className="divide-y-2 divide-black">
              {delGiorno.map((s) => (
                <RigaScheda
                  key={s.id}
                  scheda={s}
                  onApri={() => navigate(`/rapportini/${s.id}?ritorno=/`)}
                />
              ))}
            </ul>
          </Card>
        )
      })}
    </div>
  )
}

function RigaScheda({ scheda: s, onApri }: { scheda: SchedaDaValidare; onApri: () => void }) {
  const cantiere = Array.isArray(s.cantieri) ? s.cantieri[0] : s.cantieri
  const ore = oreDi(s)
  const presenti = presentiDi(s)

  return (
    <li>
      <button
        type="button"
        onClick={onApri}
        className="neo-press flex w-full cursor-pointer flex-wrap items-center justify-between gap-3 px-5 py-3 text-left hover:bg-amber-50"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-black">
            {cantiere?.codice ? `${cantiere.codice} — ` : ''}
            {cantiere?.denominazione ?? 'Cantiere non indicato'}
          </p>
          <p className="truncate text-xs font-semibold text-gray-600">
            {s.nessuna_attivita ? (
              // Il caso vale una riga tutta sua: una scheda senza ore
              // non e' incompleta, e' un cantiere fermo dichiarato.
              <span className="text-gray-700">Nessuna attività dichiarata</span>
            ) : (
              <>
                {presenti} {presenti === 1 ? 'persona' : 'persone'} ·{' '}
                <span className="numerico">{formattaNumero(ore)}</span> ore
                {s.meteo && ` · ${s.meteo}`}
              </>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Il tecnico ha scritto qualcosa apposta per lui: dirglielo
              qui evita che se ne accorga solo entrando, o mai. */}
          {s.annotazioni && (
            <Badge className="bg-amber-200 px-2 py-0.5 text-[10px]">nota</Badge>
          )}
          {s.nessuna_attivita && (
            <Badge className="px-2 py-0.5 text-[10px]">ferma</Badge>
          )}
          {s.numero && (
            <Badge className={cn('px-2 py-0.5 text-[10px]')}>
              n. {s.numero}/{s.anno}
            </Badge>
          )}
        </div>
      </button>
    </li>
  )
}
