import { useState } from 'react'
import { useNavigate } from 'react-router'
import { data as fmtData, ora } from '../../lib/formato'
import { Avviso, Button, Table, Vuoto, cn } from '../../ui'
import { useSession } from '../auth/SessionProvider'
import { usePermission } from '../auth/usePermission'
import { chiedeAncora } from './regole'
import { StatoRapportino } from './stato'
import { useRapportini } from './useRapportini'

/* ══════════════════════════════════════════════════════════════════
   L'ELENCO DEI RAPPORTINI, e cosa ci si viene a fare.

   Si apre su CIO' CHE CHIEDE ANCORA QUALCOSA — bozze, inviati,
   respinti — e non su tutto. Chiesto dall'utente il 2026-09-22
   guardando ventotto righe di cui meta' gia' chiuse: «mettimi un filtro
   per togliere dalla vista tutti i rapportini validati e quindi
   lasciare quelli da validare».

   E' la stessa regola della home: si mostra cosa c'e' da fare, mai una
   bacheca di cio' che e' gia' andato bene. Un elenco che cresce a ogni
   giornata e non si accorcia mai smette di essere letto dopo tre
   giorni, e con lui smettono di vedersi le due righe che contavano.

   L'archivio NON sparisce, si sposta di un click: e' un documento di
   cantiere, si va a cercare quando serve — per una contestazione, per
   un conto che non torna — e quella e' una ricerca, non una lettura
   quotidiana. L'interruttore dice sempre quanti ce ne sono dall'altra
   parte, cosi' nessuno deve chiedersi se la pagina gli sta nascondendo
   qualcosa.
   ══════════════════════════════════════════════════════════════════ */

/** Cosa si sta guardando. `aperti` e' il default e non e' una
 *  preferenza: e' la domanda con cui si entra in questa pagina. */
type Vista = 'aperti' | 'tutti'

export function RapportiniPage() {
  const [vista, setVista] = useState<Vista>('aperti')
  const { app } = useSession()
  const { data: rapportini, isPending, error } = useRapportini()
  const puoValidare = usePermission('rapportini.validate')
  const puoCreare = usePermission('rapportini.create')
  const navigate = useNavigate()

  if (isPending) {
    return <p className="text-sm font-bold text-gray-600">Carico i rapportini…</p>
  }

  if (error) {
    return <Avviso tono="errore">Non riesco a leggere i rapportini: {error.message}</Avviso>
  }

  // Per chi valida, la coda di lavoro e' l'unica cosa che conta davvero:
  // quanti ne ha in attesa sul tavolo.
  const daValidare = rapportini.filter((r) => r.stato === 'inviato').length

  const aperti = rapportini.filter((r) => chiedeAncora(r.stato))
  const chiusi = rapportini.length - aperti.length
  const inTabella = vista === 'aperti' ? aperti : rapportini

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-black">Rapportini</h1>
          {/* Il conteggio dice cosa si sta guardando ADESSO, non quanti
              ne esistono: «28 in elenco» sopra una tabella da 14 righe
              e' un numero che contraddice quello che si vede. */}
          <p className="text-xs font-semibold text-gray-600">
            {vista === 'aperti'
              ? `${aperti.length} da seguire`
              : `${rapportini.length} in tutto`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* L'INTERRUTTORE. Due bottoni e non una tendina: le scelte
              sono due, e una tendina da due voci chiede un click in piu'
              per dire una cosa che sta gia' tutta sullo schermo. Stesso
              disegno dell'interruttore settimana/mese in «Ore per
              persona», perche' e' lo stesso gesto.

              Compare solo se c'e' davvero qualcosa nell'archivio: al
              primo mese di lavoro non c'e' niente di chiuso, e un
              interruttore fra «14» e «14» e' un comando che non fa
              niente. */}
          {chiusi > 0 && (
            <div className="flex overflow-hidden rounded-xl border-2 border-black">
              {(
                [
                  ['aperti', 'Da seguire', aperti.length],
                  ['tutti', 'Tutti', rapportini.length],
                ] as const
              ).map(([v, etichetta, quanti]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVista(v)}
                  aria-pressed={vista === v}
                  className={cn(
                    'px-4 py-2 text-xs font-bold uppercase tracking-wide',
                    vista === v
                      ? 'bg-amber-400 text-black'
                      : 'bg-white text-gray-600 hover:bg-amber-50',
                  )}
                >
                  {etichetta}{' '}
                  <span className="numerico font-black">{quanti}</span>
                </button>
              ))}
            </div>
          )}

          {/* Il cancello sta QUI, sull'azione. La pagina resta leggibile a
              chi ha solo il diritto di leggere. */}
          {puoCreare && (
            <Button variante="primario" onClick={() => navigate('/rapportini/nuovo')}>
              Nuovo rapportino
            </Button>
          )}
        </div>
      </div>

      {/* L'avviso dice una cosa che l'interruttore NON dice: quanti
          aspettano LUI. «Da seguire» mette insieme le bozze del tecnico,
          gli inviati e i respinti — tre attese diverse, di tre persone
          diverse. Qui si isola la sua. */}
      {puoValidare && daValidare > 0 && (
        <Avviso tono="info">
          {daValidare === 1
            ? 'C’è 1 rapportino che aspetta la tua firma.'
            : `Ci sono ${daValidare} rapportini che aspettano la tua firma.`}
          {aperti.length > daValidare &&
            ` Gli altri ${aperti.length - daValidare} sono in mano al tecnico.`}
        </Avviso>
      )}

      {rapportini.length === 0 ? (
        <Vuoto>
          Nessun rapportino. Il primo si compila dal cantiere, a fine giornata.
        </Vuoto>
      ) : inTabella.length === 0 ? (
        /* Niente di aperto NON e' un elenco vuoto: e' il lavoro in
           pari, e va detto come una buona notizia invece che come
           un'assenza. */
        <Vuoto>
          Tutto validato: non c&rsquo;è nessun rapportino da seguire.{' '}
          {chiusi > 0 && `L’archivio ne ha ${chiusi}, si vede da «Tutti».`}
        </Vuoto>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Data</th>
              <th>N.</th>
              <th>Cantiere</th>
              <th>Orario</th>
              <th>Stato</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {inTabella.map((r) => (
              <tr key={r.id}>
                <td className="numerico font-bold">{fmtData(r.data)}</td>
                <td className="numerico text-gray-600">
                  {r.numero ? `${r.numero}/${r.anno}` : '—'}
                </td>
                <td className="font-semibold">
                  {r.cantieri ? (
                    <>
                      <span className="numerico text-gray-600">{r.cantieri.codice}</span>{' '}
                      {r.cantieri.denominazione}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="numerico text-gray-600">
                  {r.ora_inizio || r.ora_fine ? `${ora(r.ora_inizio)}–${ora(r.ora_fine)}` : '—'}
                </td>
                <td className="whitespace-nowrap">
                  <StatoRapportino stato={r.stato} />
                  {/* Il motivo del rifiuto e' la sola cosa che l'autore
                      deve leggere subito: senza, "respinto" non gli dice
                      cosa correggere. */}
                  {r.stato === 'respinto' && r.motivo_rifiuto && (
                    <p className="mt-1 max-w-xs text-[11px] font-semibold text-rose-700">
                      {r.motivo_rifiuto}
                    </p>
                  )}
                  {r.compilato_da === app?.userId && (
                    <p className="mt-1 text-[10px] font-bold uppercase text-gray-500">tuo</p>
                  )}
                </td>
                <td className="text-right">
                  <Button dimensione="sm" onClick={() => navigate(`/rapportini/${r.id}`)}>
                    Apri
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  )
}
