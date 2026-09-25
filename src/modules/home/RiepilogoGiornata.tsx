import { useLocation, useNavigate } from 'react-router'
import { dataEstesa, numero } from '../../lib/formato'
import { Avviso, Badge, Button, Card, cn } from '../../ui'
import { useOreEconomia } from '../cantieri/noteContabili'
import { totaleOre, type GiornataPersonale } from '../oreproprie/orePersonali'
import { apriDa } from '../rapportini/percorso'
import { useRapportiniCompleti, type RapportinoCompleto } from '../rapportini/rapportino'
import { useAssenze } from '../rapportini/useAssenze'

/* ══════════════════════════════════════════════════════════════════
   LA GIORNATA A VOLO D'UCCELLO, prima di spedirla. Dal 2026-09-25.

   Chiesto dall'utente: «prima di inviare il Foglio della giornata il
   tecnico puo' vedere a volo d'uccello tutti i report che ha compilato,
   inclusi quelli in cui non c'e' stata attivita', e cosi', dopo aver
   avuto una visione globale di tutto il lavoro che ha fatto, quando si
   sentira' piu' sicuro inviera' tutto al titolare».

   Le card in home dicono SE una scheda c'e' — un colore per cantiere —
   non COSA c'e' scritto. Per rileggere la giornata bisognava aprirle una
   per una, e sette andate e ritorno prima di un invio che non si ritira
   sono la ragione per cui non lo fa nessuno.

   Qui c'e' tutto quello che il titolare ricevera', nello stesso ordine:
   ogni cantiere con la sua squadra e le ore, le note, i lavori extra; i
   cantieri fermi; le ore di chi scrive; chi era assente. In fondo il
   pulsante d'invio — lo stesso della fascia, con le stesse regole —
   perche' l'invio arriva DOPO la lettura, non accanto.

   Dove c'e' da correggere, «Apri» porta alla scheda: il riepilogo si
   legge, non si modifica.
   ══════════════════════════════════════════════════════════════════ */

export type SchedaDelGiorno = {
  cantiere: { id: string; codice: string; denominazione: string }
  rapportinoId: string | null
}

export function RiepilogoGiornata({
  giorno,
  schede,
  mieOre,
  conScheda,
  puoInviare,
  perche,
  inCorso,
  onInvia,
  onChiudi,
}: {
  giorno: string
  schede: SchedaDelGiorno[]
  /** Il foglio personale di chi scrive, se c'e'. */
  mieOre: GiornataPersonale | null | undefined
  /** Chi scrive ha una scheda in anagrafica: senza, le sue ore non esistono. */
  conScheda: boolean
  puoInviare: boolean
  /** Perche' non si puo' ancora inviare, in una frase. */
  perche: string | null
  inCorso: boolean
  onInvia: () => void
  onChiudi: () => void
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const ids = schede.map((s) => s.rapportinoId).filter((x): x is string => Boolean(x))
  const { data: rapportini, isPending, error } = useRapportiniCompleti(ids)
  const { data: extra } = useOreEconomia(giorno, giorno)
  const { data: assenze } = useAssenze(giorno)

  const perId = new Map((rapportini ?? []).map((r) => [r.id, r]))
  const conAttivita = (rapportini ?? []).filter((r) => !r.nessuna_attivita)
  const oreSquadre = conAttivita.reduce((t, r) => t + oreDi(r), 0)
  const persone = new Set(
    conAttivita.flatMap((r) =>
      (r.rapportino_ore ?? []).filter((o) => oreRiga(o) > 0).map((o) => o.dipendente_id),
    ),
  )
  const assenti = [...(assenze?.values() ?? [])]

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black bg-sky-300 px-5 py-3">
        <div>
          <h2 className="text-lg font-extrabold capitalize text-black">
            La giornata di {dataEstesa(giorno)}
          </h2>
          <p className="text-xs font-bold text-black/70">
            {schede.length} {schede.length === 1 ? 'cantiere' : 'cantieri'} ·{' '}
            {conAttivita.length} con attività · <span className="numerico">{numero(oreSquadre)}</span>{' '}
            ore di squadra · {persone.size} {persone.size === 1 ? 'persona' : 'persone'}
          </p>
        </div>
        <Button dimensione="sm" onClick={onChiudi}>
          Torna ai cantieri
        </Button>
      </div>

      {error && (
        <Avviso tono="errore" className="m-4">
          Non riesco a leggere le schede: {(error as Error).message}
        </Avviso>
      )}
      {isPending && ids.length > 0 ? (
        <p className="px-5 py-4 text-sm font-bold text-gray-600">Carico le schede…</p>
      ) : (
        <ul className="divide-y-2 divide-black">
          {schede.map(({ cantiere, rapportinoId }) => {
            const r = rapportinoId ? perId.get(rapportinoId) : undefined
            const lavoriExtra = (extra?.note ?? []).filter((n) => n.cantiere_id === cantiere.id)
            return (
              <li key={cantiere.id} className="grid gap-2 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-black">
                      {cantiere.codice} — {cantiere.denominazione}
                    </p>
                    {r && !r.nessuna_attivita && (r.ora_inizio || r.ora_fine) && (
                      <p className="text-xs font-semibold text-gray-600">
                        dalle {r.ora_inizio?.slice(0, 5) ?? '—'} alle {r.ora_fine?.slice(0, 5) ?? '—'}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatoScheda r={r} />
                    {r && (
                      <Button
                        dimensione="sm"
                        onClick={() => navigate(`/rapportini/${r.id}`, apriDa(location, 'Home'))}
                      >
                        Apri
                      </Button>
                    )}
                  </div>
                </div>

                {!r ? (
                  <p className="text-sm font-bold text-rose-700">Manca la scheda di questo cantiere.</p>
                ) : r.nessuna_attivita ? (
                  <p className="text-sm font-semibold text-gray-600">
                    Nessuna attività dichiarata{r.note ? ` · ${r.note}` : ''}
                  </p>
                ) : (
                  <>
                    <Squadra r={r} />
                    {r.note && (
                      <p className="whitespace-pre-wrap text-sm text-black">
                        <span className="font-extrabold">Descrizione attività: </span>
                        {r.note}
                      </p>
                    )}
                  </>
                )}

                {r?.annotazioni && (
                  <p className="rounded-lg border-2 border-black bg-amber-100 px-3 py-2 text-xs font-semibold">
                    <span className="font-extrabold">Note per il titolare: </span>
                    {r.annotazioni}
                  </p>
                )}
                {lavoriExtra.length > 0 && (
                  <div className="text-xs">
                    <p className="font-extrabold uppercase tracking-wide text-gray-600">
                      Lavori extra
                    </p>
                    <ul className="list-disc pl-5">
                      {lavoriExtra.map((n) => (
                        <li key={n.id} className="whitespace-pre-wrap font-semibold">
                          {n.descrizione}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            )
          })}

          {/* Le ore di chi scrive, dopo i cantieri: la giornata e' fatta
              di cantieri, e le sue ore sono la coda del racconto. */}
          {conScheda && (
            <li className="grid gap-1 bg-gray-50 px-5 py-4">
              <p className="text-sm font-extrabold text-black">Le tue ore</p>
              {mieOre && totaleOre(mieOre) > 0 ? (
                <p className="text-sm font-semibold text-gray-800">
                  <span className="numerico font-black">{numero(Number(mieOre.ore_ordinarie))}</span>{' '}
                  ordinarie
                  {Number(mieOre.ore_straordinarie) > 0 &&
                    ` · ${numero(Number(mieOre.ore_straordinarie))} straordinarie`}
                  {Number(mieOre.ore_assenza) > 0 &&
                    ` · ${numero(Number(mieOre.ore_assenza))} di ${mieOre.tipo_assenza ?? 'assenza'}`}
                  {mieOre.descrizione && ` · ${mieOre.descrizione}`}
                </p>
              ) : (
                <p className="text-sm font-bold text-rose-700">Non le hai ancora scritte.</p>
              )}
            </li>
          )}

          {assenti.length > 0 && (
            <li className="grid gap-2 bg-gray-50 px-5 py-4">
              <p className="text-sm font-extrabold text-black">Assenti</p>
              <div className="flex flex-wrap gap-1.5">
                {assenti.map((a) => (
                  <span
                    key={a.id}
                    className="rounded-full border-2 border-black bg-gray-200 px-2.5 py-0.5 text-[11px] font-bold text-gray-700"
                  >
                    {a.dipendenti ? `${a.dipendenti.cognome} ${a.dipendenti.nome}` : '—'} ·{' '}
                    <span className="uppercase">{a.motivo}</span>
                  </span>
                ))}
              </div>
            </li>
          )}
        </ul>
      )}

      {/* L'invio IN FONDO, dopo la lettura. */}
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-3 border-t-2 border-black px-5 py-4',
          puoInviare ? 'bg-lime-100' : 'bg-white',
        )}
      >
        <p className="text-sm font-bold text-gray-800">
          {puoInviare
            ? 'Se è tutto giusto, manda la giornata al titolare. Dopo l’invio non si modifica più: se c’è un errore te la rimanda lui.'
            : (perche ?? 'Non c’è niente da inviare.')}
        </p>
        <Button variante="primario" disabled={!puoInviare || inCorso} onClick={onInvia}>
          {inCorso ? 'Invio…' : 'Invia il foglio della giornata'}
        </Button>
      </div>
    </Card>
  )
}

/* ── pezzi ────────────────────────────────────────────────────────── */

type RigaOre = NonNullable<RapportinoCompleto['rapportino_ore']>[number]

function oreRiga(o: RigaOre): number {
  return Number(o.ore_ordinarie) + Number(o.ore_straordinarie)
}

function oreDi(r: RapportinoCompleto): number {
  return (r.rapportino_ore ?? []).reduce((t, o) => t + oreRiga(o), 0)
}

function StatoScheda({ r }: { r: RapportinoCompleto | undefined }) {
  if (!r) return <Badge colore="errore">manca</Badge>
  if (r.stato === 'bozza') return <Badge colore="attesa">da inviare</Badge>
  if (r.stato === 'respinto') return <Badge colore="errore">respinta</Badge>
  if (r.stato === 'inviato') return <Badge colore="successo">inviata</Badge>
  return <Badge colore="info">firmata</Badge>
}

/** La squadra in una tabellina: chi, quante ore, di che tipo. */
function Squadra({ r }: { r: RapportinoCompleto }) {
  const righe = (r.rapportino_ore ?? [])
    .filter((o) => oreRiga(o) > 0 || Number(o.ore_trasferta) > 0 || Number(o.ore_assenza) > 0)
    .sort((a, b) =>
      `${a.dipendenti?.cognome} ${a.dipendenti?.nome}`.localeCompare(
        `${b.dipendenti?.cognome} ${b.dipendenti?.nome}`,
        'it',
      ),
    )
  if (righe.length === 0) {
    return <p className="text-sm font-bold text-rose-700">Nessuna ora scritta sulla squadra.</p>
  }
  return (
    <div className="overflow-x-auto rounded-lg border-2 border-black">
      <table className="w-full text-xs">
        <thead className="bg-gray-100">
          <tr className="border-b-2 border-black">
            <th className="px-3 py-1.5 text-left font-bold uppercase">Chi</th>
            <th className="px-3 py-1.5 text-right font-bold uppercase">Ord.</th>
            <th className="px-3 py-1.5 text-right font-bold uppercase">Str.</th>
            <th className="px-3 py-1.5 text-right font-bold uppercase">Trasf.</th>
            <th className="px-3 py-1.5 text-left font-bold uppercase">Assenza</th>
          </tr>
        </thead>
        <tbody>
          {righe.map((o) => (
            <tr key={o.id} className="border-b border-gray-200 last:border-b-0">
              <td className="px-3 py-1.5 font-bold">
                {o.dipendenti ? `${o.dipendenti.cognome} ${o.dipendenti.nome}` : '—'}
              </td>
              <td className="numerico px-3 py-1.5 text-right font-black">
                {numero(Number(o.ore_ordinarie))}
              </td>
              <td className="numerico px-3 py-1.5 text-right">
                {Number(o.ore_straordinarie) ? numero(Number(o.ore_straordinarie)) : '—'}
              </td>
              <td className="numerico px-3 py-1.5 text-right">
                {Number(o.ore_trasferta) ? numero(Number(o.ore_trasferta)) : '—'}
              </td>
              <td className="px-3 py-1.5 text-gray-700">
                {Number(o.ore_assenza) > 0
                  ? `${numero(Number(o.ore_assenza))} h ${o.tipo_assenza ?? ''}`
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-black bg-gray-50">
            <td className="px-3 py-1.5 font-extrabold">Totale</td>
            <td className="numerico px-3 py-1.5 text-right font-black" colSpan={2}>
              {numero(oreDi(r))} h
            </td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
