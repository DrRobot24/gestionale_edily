import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Avviso, Badge, Button, Table, Vuoto } from '../../ui'
import { usePermission } from '../auth/usePermission'
import { useFornitori } from './fornitori'

export function FornitoriPage() {
  const navigate = useNavigate()
  const [conArchiviati, setConArchiviati] = useState(false)
  const puoScrivere = usePermission('anagrafiche.write')

  const { data: fornitori, isPending, error } = useFornitori({ soloAttivi: !conArchiviati })

  if (isPending) return <p className="text-sm font-bold text-gray-600">Carico i fornitori…</p>
  if (error) return <Avviso tono="errore">Non riesco a leggere i fornitori: {error.message}</Avviso>

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-black">Fornitori</h1>
          <p className="text-xs font-semibold text-gray-600">
            {fornitori.length} in elenco — da qui entrano bolle e fatture di acquisto
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
            <Button variante="primario" onClick={() => navigate('/anagrafiche/fornitori/nuovo')}>
              Nuovo fornitore
            </Button>
          )}
        </div>
      </div>

      {fornitori.length === 0 ? (
        <Vuoto>
          Nessun fornitore in anagrafica. Serve almeno lui per registrare una bolla di
          trasporto: è il fornitore che dice a quale acquisto appartiene il materiale.
        </Vuoto>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Ragione sociale</th>
              <th>Partita IVA</th>
              <th>Categoria</th>
              <th>Comune</th>
              <th>Contatti</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {fornitori.map((f) => (
              <tr key={f.id} className={f.attivo ? undefined : 'bg-gray-50 text-gray-500'}>
                <td className="font-semibold">
                  {f.ragione_sociale}
                  {!f.attivo && <Badge className="ml-2 px-2 py-0.5 text-[10px]">archiviato</Badge>}
                </td>
                <td className="numerico text-gray-600">{f.partita_iva ?? '—'}</td>
                <td className="text-gray-600">{f.categoria ?? '—'}</td>
                <td className="text-gray-600">
                  {f.comune ? `${f.comune}${f.provincia ? ` (${f.provincia})` : ''}` : '—'}
                </td>
                <td className="text-gray-600">{f.email ?? f.telefono ?? '—'}</td>
                <td className="text-right">
                  <Button
                    dimensione="sm"
                    onClick={() => navigate(`/anagrafiche/fornitori/${f.id}`)}
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
