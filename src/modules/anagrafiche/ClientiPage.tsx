import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Avviso, Badge, Button, Table, Vuoto } from '../../ui'
import { usePermission } from '../auth/usePermission'
import { useClienti } from './clienti'

export function ClientiPage() {
  const navigate = useNavigate()
  const [conArchiviati, setConArchiviati] = useState(false)
  const puoScrivere = usePermission('anagrafiche.write')

  const { data: clienti, isPending, error } = useClienti({ soloAttivi: !conArchiviati })

  if (isPending) return <p className="text-sm font-bold text-gray-600">Carico i clienti…</p>
  if (error) return <Avviso tono="errore">Non riesco a leggere i clienti: {error.message}</Avviso>

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-black">Clienti</h1>
          <p className="text-xs font-semibold text-gray-600">
            {clienti.length} in elenco — è da qui che comincia ogni cantiere
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-bold">
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer accent-amber-400"
              checked={conArchiviati}
              onChange={(e) => setConArchiviati(e.target.checked)}
            />
            Mostra archiviati
          </label>

          {puoScrivere && (
            <Button variante="primario" onClick={() => navigate('/anagrafiche/clienti/nuovo')}>
              Nuovo cliente
            </Button>
          )}
        </div>
      </div>

      {clienti.length === 0 ? (
        <Vuoto>
          Nessun cliente in anagrafica. Finché non ce n&rsquo;è almeno uno non si può aprire
          un cantiere.
        </Vuoto>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Ragione sociale</th>
              <th>Partita IVA</th>
              <th>Comune</th>
              <th>Contatti</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {clienti.map((c) => (
              <tr key={c.id} className={c.attivo ? undefined : 'bg-gray-50 text-gray-500'}>
                <td className="font-semibold">
                  {c.ragione_sociale}
                  {!c.attivo && <Badge className="ml-2 px-2 py-0.5 text-[10px]">archiviato</Badge>}
                </td>
                <td className="numerico text-gray-600">{c.partita_iva ?? '—'}</td>
                <td className="text-gray-600">
                  {c.comune ? `${c.comune}${c.provincia ? ` (${c.provincia})` : ''}` : '—'}
                </td>
                <td className="text-gray-600">{c.email ?? c.telefono ?? '—'}</td>
                <td className="text-right">
                  <Button
                    dimensione="sm"
                    onClick={() => navigate(`/anagrafiche/clienti/${c.id}`)}
                  >
                    {puoScrivere ? 'Apri' : 'Vedi'}
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
