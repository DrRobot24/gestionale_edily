import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { data as fmtData, numero as fmtNumero, ora } from '../../lib/formato'
import { Avviso, Button, Card, Cifra, Table, Vuoto } from '../../ui'
import { useSession } from '../auth/SessionProvider'
import { usePermission } from '../auth/usePermission'
import { useRapportino, useTransizione } from './rapportino'
import { useFoto } from './useFoto'
import { modificabile } from './regole'
import { StatoRapportino } from './stato'

export function RapportinoPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const ritorno = params.get('ritorno')
  const { app } = useSession()
  const { data: r, isPending, error } = useRapportino(id)
  const transizione = useTransizione()

  const puoValidare = usePermission('rapportini.validate')
  const puoRiaprire = usePermission('rapportini.reopen')
  const tieneIContabili = usePermission('economics.write')

  /**
   * Chi approva non registra.
   *
   * E' la separazione dei compiti che si usa in contabilita': il
   * titolare valida il rapportino, l'amministrazione lo porta nei conti.
   * Se le due cose le facesse la stessa persona, il controllo
   * incrociato fra chi dice "questo lavoro e' stato fatto" e chi dice
   * "questo lavoro e' costato tanto" sparirebbe.
   *
   * Non si poteva esprimere con un permesso: `owner` li ha tutti e
   * sedici, quindi qualunque permesso avessimo scelto lui ce l'avrebbe.
   * Si esprime con l'assenza: contabilizza chi tiene i conti e NON
   * valida. Regge su tutti i ruoli - owner e admin validano e restano
   * fuori, amministrazione ha economics.write senza validate ed entra,
   * il tecnico non ha ne' l'uno ne' l'altro.
   *
   * ATTENZIONE: qui si nasconde un pulsante, non si nega un'azione. Il
   * trigger del database lascia ancora fare la transizione a chiunque
   * abbia i permessi giusti. Per renderla una regola vera servirebbe un
   * permesso `rapportini.contabilizza` da non assegnare a owner e admin,
   * piu' il controllo nel trigger.
   */
  const puoContabilizzare = tieneIContabili && !puoValidare

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
  // La colonna trasferta compare solo se qualcuno e' andato in trasferta
  // davvero: alla Edily e' l'eccezione, e una colonna di zeri toglie
  // spazio alle due che contano.
  const conTrasferta = totaleTrasferta > 0

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
        <Button onClick={() => navigate(ritorno ?? '/rapportini')}>
          {ritorno === '/' ? 'Torna alla giornata' : <>Torna all&rsquo;elenco</>}
        </Button>
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
        {/* Orario e meteo si vedono solo dove qualcuno li ha scritti:
            adesso sono campi facoltativi, e una casella fissa che dice
            sempre "—" fa sembrare incompleta una scheda che non lo e'. */}
        {(r.ora_inizio || r.ora_fine) && (
          <Dato etichetta="Orario">{`${ora(r.ora_inizio)}–${ora(r.ora_fine)}`}</Dato>
        )}
        <Dato etichetta="Inviato">{r.inviato_at ? fmtData(r.inviato_at) : '—'}</Dato>
        <Dato etichetta="Validato">{r.validato_at ? fmtData(r.validato_at) : '—'}</Dato>
        {r.meteo && <Dato etichetta="Meteo">{r.meteo}</Dato>}
        {r.note && (
          <div className="sm:col-span-4">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-600">
              Descrizione attività
            </p>
            <p className="whitespace-pre-wrap text-sm font-semibold">{r.note}</p>
          </div>
        )}

        {/* Le note al titolare hanno il fondo giallo perche' non sono
            parte del racconto della giornata: sono una cosa che il
            tecnico ha chiesto di leggere. In mezzo al resto, in grigio,
            passerebbero inosservate ed e' esattamente cio' che non deve
            succedere. */}
        {r.annotazioni && (
          <div className="rounded-xl border-2 border-black bg-amber-100 p-3 sm:col-span-4">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-black">
              Note per il titolare
            </p>
            <p className="whitespace-pre-wrap text-sm font-semibold text-black">{r.annotazioni}</p>
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
                {conTrasferta && <th className="text-right">Trasferta</th>}
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
                  {conTrasferta && (
                    <Cifra className="text-gray-600">{fmtNumero(o.ore_trasferta)}</Cifra>
                  )}
                  <td>{o.tipo_assenza ?? '—'}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-black bg-gray-50 font-bold">
                <td colSpan={2}>Totale</td>
                <Cifra colSpan={2}>{fmtNumero(totale)}</Cifra>
                {conTrasferta && <Cifra>{fmtNumero(totaleTrasferta)}</Cifra>}
                <td />
              </tr>
            </tbody>
          </Table>
        )}
      </Card>

      <GalleriaFoto rapportinoId={r.id} />

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
              <Button
                onClick={() =>
                  navigate(
                    ritorno
                      ? `/rapportini/${r.id}/modifica?ritorno=${ritorno}`
                      : `/rapportini/${r.id}/modifica`,
                  )
                }
              >
                Modifica
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
                  if (!confirm('Riaprire il rapportino? Torna compilabile e la giornata andrà rimandata.')) return
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
          puoContabilizzare={puoContabilizzare}
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
  puoContabilizzare,
  inAttesa,
}: {
  stato: string
  mio: boolean
  puoValidare: boolean
  puoContabilizzare: boolean
  inAttesa: boolean
}) {
  let testo: string | null = null

  // Il primo caso e' il piu' importante da quando l'invio singolo non
  // esiste piu': chi apre la propria bozza non trova il pulsante che
  // c'era ieri, e senza una riga qui penserebbe a un guasto.

  if (stato === 'bozza' && mio)
    testo =
      'In raccolta per il Foglio Riepilogativo di Giornata. Non si invia da sola: parte dalla home insieme a tutte le altre schede del giorno, quando sono complete.'
  else if (stato === 'respinto' && mio)
    testo =
      'Respinta dal titolare. Correggila: finche’ resta cosi’, il foglio della giornata non riparte.'
  else if (stato === 'bozza' && !mio) testo = 'È una bozza di un collega: solo chi l’ha scritta può inviarla.'
  else if (inAttesa && !puoValidare && mio)
    testo = 'È sul tavolo del titolare. Finché non lo valida o lo respinge, non si tocca più.'
  else if (inAttesa && !puoValidare)
    testo = 'In attesa di validazione. Serve il permesso rapportini.validate per intervenire.'
  else if (stato === 'validato' && !puoValidare)
    testo = 'Validato. Da qui in poi lo muove solo chi si occupa della contabilità.'
  else if (stato === 'validato' && !puoContabilizzare)
    testo =
      'Validato. Ora tocca all’amministrazione portarlo nei conti: chi approva un rapportino non lo registra anche in contabilità.'
  else if (stato === 'contabilizzato')
    testo = 'Contabilizzato: è entrato nei costi del cantiere.'

  if (!testo) return null
  return <p className="text-xs font-semibold text-gray-600">{testo}</p>
}

/**
 * Le foto in sola lettura.
 *
 * Il riquadro non compare se non ce ne sono: su una scheda senza foto
 * una cornice vuota direbbe che manca qualcosa, mentre quasi sempre non
 * mancava niente.
 *
 * Le immagini si aprono a tutta pagina in una scheda nuova. Non e' una
 * finezza: il titolare valida guardando una crepa o un getto, e la
 * miniatura serve a trovarla, non a giudicarla.
 */
function GalleriaFoto({ rapportinoId }: { rapportinoId: string }) {
  const { data: foto, isPending, error } = useFoto(rapportinoId)

  if (isPending || error) return null
  if (!foto || foto.length === 0) return null

  return (
    <Card className="grid gap-3 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-extrabold text-black">Foto del cantiere</h2>
        <p className="text-xs font-bold text-gray-600">
          {foto.length} {foto.length === 1 ? 'scatto' : 'scatti'}
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {foto.map((f) => (
          <li key={f.id}>
            {f.url ? (
              <a
                href={f.url}
                target="_blank"
                rel="noreferrer"
                className="neo-press block aspect-square overflow-hidden rounded-xl border-2 border-black bg-gray-100"
              >
                <img
                  src={f.url}
                  alt="Foto del cantiere"
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </a>
            ) : (
              <div className="flex aspect-square items-center justify-center rounded-xl border-2 border-black bg-gray-100 px-2 text-center text-[11px] font-bold text-gray-500">
                Anteprima non disponibile
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}
