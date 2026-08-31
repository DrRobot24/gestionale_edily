import { useState } from 'react'
import { useNavigate } from 'react-router'
import { data as fmtData, euro } from '../../lib/formato'
import { Avviso, Badge, Button, Cifra, Table, Vuoto } from '../../ui'
import { usePermission } from '../auth/usePermission'
import { tariffaVigente, useDipendenti } from './dipendenti'

export function DipendentiPage() {
  const navigate = useNavigate()
  const [conArchiviati, setConArchiviati] = useState(false)
  const puoScrivere = usePermission('anagrafiche.write')

  const { data: dipendenti, isPending, error } = useDipendenti({ soloAttivi: !conArchiviati })

  if (isPending) return <p className="text-sm font-bold text-gray-600">Carico gli operai…</p>
  if (error) return <Avviso tono="errore">Non riesco a leggere gli operai: {error.message}</Avviso>

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-black">Operai</h1>
          <p className="text-xs font-semibold text-gray-600">{dipendenti.length} in elenco</p>
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
            <Button variante="primario" onClick={() => navigate('/anagrafiche/operai/nuovo')}>
              Nuovo operaio
            </Button>
          )}
        </div>
      </div>

      {dipendenti.length === 0 ? (
        <Vuoto>Nessun operaio in anagrafica.</Vuoto>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Matr.</th>
              <th>Cognome e nome</th>
              <th>Mansione</th>
              <th>Liv.</th>
              <th>Assunto</th>
              <th className="text-right">Costo orario</th>
              <th className="text-right">Straord.</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {dipendenti.map((d) => {
              const t = tariffaVigente(d.dipendente_costi)
              return (
                <tr key={d.id} className={d.attivo ? undefined : 'bg-gray-50 text-gray-500'}>
                  <td className="numerico font-bold">{d.matricola ?? '—'}</td>
                  <td className="font-semibold">
                    {d.cognome} {d.nome}
                    {!d.attivo && (
                      <Badge className="ml-2 px-2 py-0.5 text-[10px]">archiviato</Badge>
                    )}
                  </td>
                  <td className="text-gray-600">{d.mansione ?? '—'}</td>
                  <td className="numerico text-gray-600">{d.livello_ccnl ?? '—'}</td>
                  <td className="numerico text-gray-600">{fmtData(d.data_assunzione)}</td>
                  {/* Nessuna tariffa non e' un dettaglio estetico: senza,
                      le ore di questa persona valgono zero euro nel
                      consuntivo del cantiere. Va gridato, non nascosto. */}
                  {t ? (
                    <Cifra>{euro(t.costo_orario)}</Cifra>
                  ) : (
                    <td className="text-right">
                      <Badge colore="errore" className="px-2 py-0.5 text-[10px]">
                        manca
                      </Badge>
                    </td>
                  )}
                  <Cifra className="text-gray-600">
                    {t?.costo_orario_straordinario ? euro(t.costo_orario_straordinario) : '—'}
                  </Cifra>
                  <td className="text-right">
                    <Button
                      dimensione="sm"
                      onClick={() => navigate(`/anagrafiche/operai/${d.id}`)}
                    >
                      {puoScrivere ? 'Apri' : 'Vedi'}
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      )}
    </div>
  )
}
