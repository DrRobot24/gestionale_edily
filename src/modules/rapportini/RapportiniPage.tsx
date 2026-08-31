import { useNavigate } from 'react-router'
import { data as fmtData, ora } from '../../lib/formato'
import { Avviso, Button, Table, Vuoto } from '../../ui'
import { useSession } from '../auth/SessionProvider'
import { usePermission } from '../auth/usePermission'
import { StatoRapportino } from './stato'
import { useRapportini } from './useRapportini'

export function RapportiniPage() {
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

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-black">Rapportini</h1>
          <p className="text-xs font-semibold text-gray-600">{rapportini.length} in elenco</p>
        </div>

        {/* Il cancello sta QUI, sull'azione. La pagina resta leggibile a
            chi ha solo il diritto di leggere. */}
        {puoCreare && (
          <Button variante="primario" onClick={() => navigate('/rapportini/nuovo')}>
            Nuovo rapportino
          </Button>
        )}
      </div>

      {puoValidare && daValidare > 0 && (
        <Avviso tono="info">
          {daValidare === 1
            ? 'C’è 1 rapportino inviato in attesa di validazione.'
            : `Ci sono ${daValidare} rapportini inviati in attesa di validazione.`}
        </Avviso>
      )}

      {rapportini.length === 0 ? (
        <Vuoto>
          Nessun rapportino. Il primo si compila dal cantiere, a fine giornata.
        </Vuoto>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Data</th>
              <th>N.</th>
              <th>Cantiere</th>
              <th>Orario</th>
              <th>Meteo</th>
              <th>Stato</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rapportini.map((r) => (
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
                <td className="text-gray-600">{r.meteo ?? '—'}</td>
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
