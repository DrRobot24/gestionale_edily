import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Avviso, Badge, Button, Card, cn } from '../../ui'
import {
  oreLavorate,
  useOrePersonaliDaValidare,
  useValidaOrePersonali,
  type OrePersonaliDaValidare,
} from '../oreproprie/useOrePersonaliDaValidare'
import {
  useDaValidare,
  oreDi,
  presentiDi,
  type SchedaDaValidare,
} from '../rapportini/useDaValidare'
import { dataEstesa, numero as formattaNumero } from '../../lib/formato'
import { useAssenze } from '../rapportini/useAssenze'

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

   DAL 2026-09-22 CI SONO ANCHE LE ORE DEL TECNICO, nelle stesse
   giornate. Il ciclo delle ore personali si fermava a «inviato» perche'
   nessun punto del programma le portava a «validato» — lo stato
   esisteva, con tanto di etichetta verde, e nessun pulsante lo
   assegnava. Restavano in sospeso per sempre, e Stefania le vedeva a
   zero nella griglia. Trovato dall'utente: «ma Stefania non vede le ore
   che si segna il tecnico?».

   Stanno QUI e non in una pagina loro: un posto solo per tutto cio' che
   chiede la firma, cosi' il titolare non deve ricordarsi che esiste un
   secondo flusso. E si firmano UNA PER UNA, non insieme alla giornata:
   una firma data in blocco farebbe passare le ore del tecnico senza
   guardarle, che e' il contrario di validare.
   ══════════════════════════════════════════════════════════════════ */

export function GiornateDaValidare() {
  const navigate = useNavigate()
  const { data: schede, isPending, error } = useDaValidare()
  const { data: oreProprie } = useOrePersonaliDaValidare()

  if (isPending) return <p className="text-sm font-bold text-gray-600">Carico le giornate…</p>
  if (error) {
    return <Avviso tono="errore">Non riesco a leggere le schede: {error.message}</Avviso>
  }

  const personali = oreProprie ?? []

  if ((!schede || schede.length === 0) && personali.length === 0) {
    return (
      <Card className="p-5">
        <h2 className="mb-1 text-lg font-extrabold text-black">Da validare</h2>
        <p className="text-sm font-semibold text-gray-600">
          Nessuna giornata in attesa. La coda è pulita.
        </p>
      </Card>
    )
  }

  /* Raggruppa per data conservando l'ordine di arrivo, che la query ha
     gia' messo dal giorno piu' recente.

     I GIORNI ARRIVANO DA DUE FONTI e vanno fusi: puo' esserci una
     giornata con le sole ore del tecnico e nessun rapportino — capita
     quando ha passato la giornata in ufficio — e senza questa fusione
     quel giorno non comparirebbe affatto in coda. E' esattamente il
     caso che teneva le sue ore ferme per sempre. */
  const giornate = new Map<string, SchedaDaValidare[]>()
  for (const s of schede ?? []) {
    const gruppo = giornate.get(s.data)
    if (gruppo) gruppo.push(s)
    else giornate.set(s.data, [s])
  }

  const oreDelGiorno = new Map<string, OrePersonaliDaValidare[]>()
  for (const o of personali) {
    const gruppo = oreDelGiorno.get(o.data)
    if (gruppo) gruppo.push(o)
    else oreDelGiorno.set(o.data, [o])
    // Un giorno che ha solo ore proprie deve comunque esistere.
    if (!giornate.has(o.data)) giornate.set(o.data, [])
  }

  // Dal piu' recente: le due mappe fuse possono aver perso l'ordine.
  const inOrdine = [...giornate.entries()].sort((a, b) => b[0].localeCompare(a[0]))

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-lg font-extrabold text-black">Giornate da validare</h2>
        <p className="text-xs font-semibold text-gray-600">
          Il quadro d&rsquo;insieme. Apri una scheda quando vuoi entrare nel dettaglio.
        </p>
      </div>

      {inOrdine.map(([giorno, delGiorno]) => {
        const proprie = oreDelGiorno.get(giorno) ?? []
        const ore =
          delGiorno.reduce((t, s) => t + oreDi(s), 0) +
          proprie.reduce((t, o) => t + oreLavorate(o), 0)
        const ferme = delGiorno.filter((s) => s.nessuna_attivita).length
        const pezzi = delGiorno.length + proprie.length

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
                {pezzi} {pezzi === 1 ? 'scheda' : 'schede'}
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
                  onApri={() => navigate(`/rapportini/${s.id}`)}
                />
              ))}

              {/* Le ore proprie IN FONDO alla giornata, dopo i cantieri:
                  la giornata e' fatta di cantieri, e le ore di chi la
                  scrive sono la coda del racconto, non il suo inizio. */}
              {proprie.map((o) => (
                <RigaOreProprie key={o.id} riga={o} />
              ))}

              <RigaAssenti giorno={giorno} />
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

/**
 * Le ore che il tecnico si e' segnato, con la firma del titolare.
 *
 * Si firma DA QUI e non entrando in una pagina: la riga dice gia' tutto
 * cio' che c'e' da sapere — chi, quante ore, l'eventuale assenza e la
 * nota — e aprire una schermata per leggere quattro parole sarebbe un
 * viaggio per niente. I rapportini invece si aprono, perche' dentro c'e'
 * una squadra intera da guardare.
 *
 * Il respingimento chiede il motivo, e lo chiede QUI: e' il pezzo che
 * il tecnico legge per capire cosa correggere, e un rifiuto muto lo
 * lascerebbe a indovinare.
 */
function RigaOreProprie({ riga }: { riga: OrePersonaliDaValidare }) {
  const valida = useValidaOrePersonali()
  const [chiedoMotivo, setChiedoMotivo] = useState(false)
  const [motivo, setMotivo] = useState('')

  const ore = oreLavorate(riga)
  const chi = riga.dipendenti
    ? `${riga.dipendenti.cognome} ${riga.dipendenti.nome}`
    : 'Ore proprie'

  return (
    <li className="px-5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-black">
            {chi}
            {/* Si dice SUBITO che non sono ore di cantiere: senza, la
                riga sembra una scheda a cui manca il nome del cantiere. */}
            <Badge className="ml-2 bg-sky-200 px-2 py-0.5 text-[10px]">ore proprie</Badge>
          </p>
          <p className="truncate text-xs font-semibold text-gray-600">
            <span className="numerico">{formattaNumero(ore)}</span> ore
            {Number(riga.ore_assenza) > 0 &&
              ` · ${formattaNumero(Number(riga.ore_assenza))} di assenza${
                riga.tipo_assenza ? ` (${riga.tipo_assenza})` : ''
              }`}
            {riga.descrizione && ` · ${riga.descrizione}`}
          </p>
        </div>

        {!chiedoMotivo && (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variante="primario"
              dimensione="sm"
              disabled={valida.isPending}
              onClick={() => valida.mutate({ id: riga.id, valida: true })}
            >
              {valida.isPending ? 'Firmo…' : 'Valida'}
            </Button>
            <Button
              variante="danger"
              dimensione="sm"
              onClick={() => setChiedoMotivo(true)}
            >
              Respingi
            </Button>
          </div>
        )}
      </div>

      {chiedoMotivo && (
        <div className="mt-3 grid gap-2 rounded-xl border-2 border-black bg-rose-50 p-3">
          <label className="text-xs font-extrabold uppercase tracking-wide text-black">
            Cosa deve correggere?
          </label>
          <input
            type="text"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Per esempio: mancano due ore rispetto alla giornata"
            className="h-9 rounded-lg border-2 border-black bg-white px-3 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variante="danger"
              dimensione="sm"
              disabled={motivo.trim() === '' || valida.isPending}
              onClick={() =>
                valida.mutate(
                  { id: riga.id, valida: false, motivo: motivo.trim() },
                  { onSuccess: () => setChiedoMotivo(false) },
                )
              }
            >
              Rimanda indietro
            </Button>
            <Button dimensione="sm" onClick={() => setChiedoMotivo(false)}>
              Annulla
            </Button>
          </div>
        </div>
      )}

      {valida.isError && (
        <p className="mt-2 text-xs font-bold text-rose-700">
          Non riesco a salvare: {(valida.error as Error).message}
        </p>
      )}
    </li>
  )
}

/**
 * Chi quel giorno era assente, col motivo: la giornata che il titolare
 * firma comprende anche loro (2026-09-23). Stanno in fondo, dopo i
 * cantieri e le ore proprie, e spariscono se non c'e' nessuno.
 */
function RigaAssenti({ giorno }: { giorno: string }) {
  const { data: assenze } = useAssenze(giorno)
  const elenco = [...(assenze?.values() ?? [])]
  if (elenco.length === 0) return null

  return (
    <li className="bg-gray-50 px-5 py-3">
      <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-gray-600">
        Assenti
      </p>
      <div className="flex flex-wrap gap-1.5">
        {elenco
          .map((a) => ({
            a,
            chi: a.dipendenti ? `${a.dipendenti.cognome} ${a.dipendenti.nome}` : '—',
          }))
          .sort((x, y) => x.chi.localeCompare(y.chi, 'it'))
          .map(({ a, chi }) => (
            <span
              key={a.id}
              title={a.nota ?? undefined}
              className="rounded-full border-2 border-black bg-gray-200 px-2.5 py-0.5 text-[11px] font-bold text-gray-700"
            >
              {chi} · <span className="uppercase">{a.nota ?? a.motivo}</span>
            </span>
          ))}
      </div>
    </li>
  )
}

