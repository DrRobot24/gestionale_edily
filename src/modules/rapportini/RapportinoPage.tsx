import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { data as fmtData, numero as fmtNumero, ora } from '../../lib/formato'
import { Avviso, Button, Card, Cifra, Table, Vuoto } from '../../ui'
import { useSession } from '../auth/SessionProvider'
import { usePermission } from '../auth/usePermission'
import { useRapportino, useTransizione } from './rapportino'
import { modificabile } from './regole'
import { StatoRapportino } from './stato'

export function RapportinoPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { app } = useSession()
  const { data: r, isPending, error } = useRapportino(id)
  const transizione = useTransizione()

  const puoValidare = usePermission('rapportini.validate')
  const puoRiaprire = usePermission('rapportini.reopen')
  const puoContabilizzare = usePermission('economics.write')

  const [motivo, setMotivo] = useState('')
  const [chiedoMotivo, setChiedoMotivo] = useState(false)

  if (isPending) return <p className="text-sm font-bold text-gray-600">Carico il rapportino…</p>
  if (error) return <Avviso tono="errore">Non trovo questo rapportino: {error.message}</Avviso>

  const mio = r.compilato_da === app?.userId
  const ore = r.rapportino_ore ?? []

  const totale = ore.reduce(
    (s, o) => s + Number(o.ore_ordinarie) + Number(o.ore_straordinarie),
    0,
  )
  const totaleTrasferta = ore.reduce((s, o) => s + Number(o.ore_trasferta), 0)

  const adesso = () => new Date().toISOString()

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-black">
            Rapportino {r.numero ? `n. ${r.numero}/${r.anno}` : ''}
          </h1>
          <p className="text-sm font-semibold text-gray-600">
            {fmtData(r.data)}
            {r.cantieri && ` — ${r.cantieri.codice} ${r.cantieri.denominazione}`}
          </p>
          <div className="mt-2">
            <StatoRapportino stato={r.stato} />
          </div>
        </div>
        <Button onClick={() => navigate('/rapportini')}>Torna all&rsquo;elenco</Button>
      </div>

      {transizione.isError && (
        <Avviso tono="errore">{(transizione.error as Error).message}</Avviso>
      )}

      {/* Il motivo del rifiuto e' la sola cosa che l'autore deve leggere
          prima di tutto il resto: senza, "respinto" non gli dice cosa
          correggere. Sta in cima, non in fondo. */}
      {r.stato === 'respinto' && r.motivo_rifiuto && (
        <Avviso tono="errore">
          <strong>Respinto:</strong> {r.motivo_rifiuto}
        </Avviso>
      )}

      <Card className="grid gap-4 p-5 sm:grid-cols-4">
        <Dato etichetta="Orario">
          {r.ora_inizio || r.ora_fine ? `${ora(r.ora_inizio)}–${ora(r.ora_fine)}` : '—'}
        </Dato>
        <Dato etichetta="Meteo">{r.meteo ?? '—'}</Dato>
        <Dato etichetta="Inviato">{r.inviato_at ? fmtData(r.inviato_at) : '—'}</Dato>
        <Dato etichetta="Validato">{r.validato_at ? fmtData(r.validato_at) : '—'}</Dato>
        {r.note && (
          <div className="sm:col-span-4">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-600">
              Note
            </p>
            <p className="whitespace-pre-wrap text-sm font-semibold">{r.note}</p>
          </div>
        )}
      </Card>

      <Card className="grid gap-3 p-5">
        <h2 className="text-lg font-extrabold text-black">Ore</h2>
        {ore.length === 0 ? (
          <Vuoto>Nessuna riga di ore su questo rapportino.</Vuoto>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Matr.</th>
                <th>Dipendente</th>
                <th className="text-right">Ordinarie</th>
                <th className="text-right">Straord.</th>
                <th className="text-right">Trasferta</th>
                <th>Assenza</th>
              </tr>
            </thead>
            <tbody>
              {ore.map((o) => (
                <tr key={o.id} className={o.tipo_assenza ? 'bg-gray-50 text-gray-500' : undefined}>
                  <td className="numerico">{o.dipendenti?.matricola ?? '—'}</td>
                  <td className="font-semibold">
                    {o.dipendenti ? `${o.dipendenti.cognome} ${o.dipendenti.nome}` : '—'}
                  </td>
                  <Cifra>{fmtNumero(o.ore_ordinarie)}</Cifra>
                  <Cifra className="text-gray-600">{fmtNumero(o.ore_straordinarie)}</Cifra>
                  <Cifra className="text-gray-600">{fmtNumero(o.ore_trasferta)}</Cifra>
                  <td>{o.tipo_assenza ?? '—'}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-black bg-gray-50 font-bold">
                <td colSpan={2}>Totale</td>
                <Cifra colSpan={2}>{fmtNumero(totale)}</Cifra>
                <Cifra>{fmtNumero(totaleTrasferta)}</Cifra>
                <td />
              </tr>
            </tbody>
          </Table>
        )}
      </Card>

      {/* ═══ Azioni: solo quelle che la macchina a stati ammette davvero ═══ */}
      <Card className="grid gap-3 p-5">
        <h2 className="text-lg font-extrabold text-black">Cosa puoi fare</h2>

        {chiedoMotivo ? (
          <div className="grid gap-3">
            <label className="grid gap-1.5">
              <span className="text-xs font-bold uppercase">Perché lo respingi</span>
              <textarea
                autoFocus
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Mancano le ore di Marino, l'orario non torna…"
                className="min-h-20 w-full rounded-xl border-2 border-black bg-white px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <span className="text-[11px] font-semibold text-gray-500">
                È l&rsquo;unica cosa che l&rsquo;autore leggerà per capire cosa correggere.
              </span>
            </label>
            <div className="flex gap-2">
              <Button
                variante="danger"
                disabled={motivo.trim().length < 3 || transizione.isPending}
                onClick={() =>
                  transizione.mutate(
                    { id: r.id, stato: 'respinto', motivo_rifiuto: motivo.trim() },
                    { onSuccess: () => setChiedoMotivo(false) },
                  )
                }
              >
                Respingi
              </Button>
              <Button onClick={() => setChiedoMotivo(false)}>Annulla</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {/* correzione e invio: solo l'autore, solo da bozza o
                respinto. La modifica viene PRIMA dell'invio nell'ordine
                dei pulsanti perche' e' quello che serve a chi ha appena
                letto un motivo di rifiuto. */}
            {mio && modificabile(r.stato) && (
              <Button onClick={() => navigate(`/rapportini/${r.id}/modifica`)}>
                Modifica
              </Button>
            )}

            {mio && (r.stato === 'bozza' || r.stato === 'respinto') && (
              <Button
                variante="primario"
                disabled={transizione.isPending}
                onClick={() =>
                  transizione.mutate({
                    id: r.id,
                    stato: 'inviato',
                    inviato_at: adesso(),
                    motivo_rifiuto: null,
                  })
                }
              >
                Invia al titolare
              </Button>
            )}

            {puoValidare && r.stato === 'inviato' && (
              <>
                <Button
                  variante="primario"
                  disabled={transizione.isPending}
                  onClick={() =>
                    transizione.mutate({
                      id: r.id,
                      stato: 'validato',
                      validato_at: adesso(),
                      validato_da: app!.userId,
                    })
                  }
                >
                  Valida
                </Button>
                <Button variante="danger" onClick={() => setChiedoMotivo(true)}>
                  Respingi
                </Button>
              </>
            )}

            {/* riapertura: da validato si torna in BOZZA, non in respinto
                — verificato, validato → respinto il trigger lo rifiuta. */}
            {puoRiaprire && r.stato === 'validato' && (
              <Button
                disabled={transizione.isPending}
                onClick={() => {
                  if (!confirm('Riaprire il rapportino? Torna in bozza e andrà rinviato.')) return
                  transizione.mutate({
                    id: r.id,
                    stato: 'bozza',
                    validato_at: null,
                    validato_da: null,
                    inviato_at: null,
                  })
                }}
              >
                Riapri
              </Button>
            )}

            {puoContabilizzare && r.stato === 'validato' && (
              <Button
                disabled={transizione.isPending}
                onClick={() =>
                  transizione.mutate({
                    id: r.id,
                    stato: 'contabilizzato',
                    contabilizzato_at: adesso(),
                  })
                }
              >
                Contabilizza
              </Button>
            )}

            {puoContabilizzare && r.stato === 'contabilizzato' && (
              <Button
                disabled={transizione.isPending}
                onClick={() =>
                  transizione.mutate({ id: r.id, stato: 'validato', contabilizzato_at: null })
                }
              >
                Storna dalla contabilità
              </Button>
            )}
          </div>
        )}

        <Spiegazione
          stato={r.stato}
          mio={mio}
          puoValidare={puoValidare}
          inAttesa={r.stato === 'inviato'}
        />
      </Card>
    </div>
  )
}

function Dato({ etichetta, children }: { etichetta: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-600">{etichetta}</p>
      <p className="numerico text-sm font-bold">{children}</p>
    </div>
  )
}

/** Dire perche' non c'e' nessun pulsante vale quanto il pulsante: senza,
 *  l'utente pensa che l'applicazione sia rotta. */
function Spiegazione({
  stato,
  mio,
  puoValidare,
  inAttesa,
}: {
  stato: string
  mio: boolean
  puoValidare: boolean
  inAttesa: boolean
}) {
  let testo: string | null = null

  if (stato === 'bozza' && !mio) testo = 'È una bozza di un collega: solo chi l’ha scritta può inviarla.'
  else if (inAttesa && !puoValidare && mio)
    testo = 'È sul tavolo del titolare. Finché non lo valida o lo respinge, non si tocca più.'
  else if (inAttesa && !puoValidare)
    testo = 'In attesa di validazione. Serve il permesso rapportini.validate per intervenire.'
  else if (stato === 'validato' && !puoValidare)
    testo = 'Validato. Da qui in poi lo muove solo chi si occupa della contabilità.'
  else if (stato === 'contabilizzato')
    testo = 'Contabilizzato: è entrato nei costi del cantiere.'

  if (!testo) return null
  return <p className="text-xs font-semibold text-gray-600">{testo}</p>
}
