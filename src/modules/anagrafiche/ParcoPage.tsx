import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Avviso, Badge, Button, Table, Vuoto, cn } from '../../ui'
import { data as fmtData } from '../../lib/formato'
import { usePermission } from '../auth/usePermission'
import { PARCO, scadenzaVicina, useParco, type TipoParco } from './parco'

/** L'elenco dei mezzi o delle attrezzature. Vedi `parco.ts`. */
export function ParcoPage({ tipo }: { tipo: TipoParco }) {
  const navigate = useNavigate()
  const [conArchiviati, setConArchiviati] = useState(false)
  const puoScrivere = usePermission('anagrafiche.write')
  const conf = PARCO[tipo]

  const { data: voci, isPending, error } = useParco(tipo, { soloAttivi: !conArchiviati })

  if (isPending) return <p className="text-sm font-bold text-gray-600">Carico {conf.titolo.toLowerCase()}…</p>
  if (error) return <Avviso tono="errore">Non riesco a leggere {conf.titolo.toLowerCase()}: {error.message}</Avviso>

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-black">{conf.titolo}</h1>
          <p className="text-xs font-semibold text-gray-600">
            {voci.length} in elenco — {conf.sottotitolo}
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
            <Button variante="primario" onClick={() => navigate(`${conf.percorso}/nuovo`)}>
              Nuovo {conf.singolare}
            </Button>
          )}
        </div>
      </div>

      {voci.length === 0 ? (
        <Vuoto>
          Nessun {conf.singolare} in anagrafica. Quelli inseriti qui compaiono nel box «Mezzi e
          attrezzature» del rapportino.
        </Vuoto>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Codice</th>
              <th>Descrizione</th>
              {conf.colonne.map((c) => (
                <th key={c.nome}>{c.etichetta}</th>
              ))}
              <th>Proprietà</th>
              <th>Scadenze</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {voci.map((v) => (
              <tr key={v.id} className={v.attivo ? undefined : 'bg-gray-50 text-gray-500'}>
                <td className="numerico font-bold">{(v.codice as string) ?? '—'}</td>
                <td className="font-semibold">
                  {v.descrizione}
                  {!v.attivo && <Badge className="ml-2 px-2 py-0.5 text-[10px]">archiviato</Badge>}
                </td>
                {conf.colonne.map((c) => (
                  <td key={c.nome} className="text-gray-600">
                    {(v[c.nome] as string) ?? '—'}
                  </td>
                ))}
                <td className="text-gray-600">{v.proprieta === 'noleggio' ? 'Noleggio' : 'Propria'}</td>
                <td>
                  <Scadenze voce={v} campi={conf.scadenze} />
                </td>
                <td className="text-right">
                  <Button dimensione="sm" onClick={() => navigate(`${conf.percorso}/${v.id}`)}>
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

/** Le scadenze della riga: rosse se passate, gialle entro trenta
 *  giorni, grigie le altre. */
function Scadenze({ voce, campi }: { voce: Record<string, unknown>; campi: string[] }) {
  const date = campi.map((c) => voce[c] as string | null).filter((d): d is string => Boolean(d))
  if (date.length === 0) return <span className="text-gray-400">—</span>
  return (
    <span className="flex flex-wrap gap-1">
      {date.map((d, i) => {
        const stato = scadenzaVicina(d)
        return (
          <span
            key={i}
            className={cn(
              'numerico rounded border border-black px-1.5 text-[11px] font-bold',
              stato === 'scaduta' ? 'bg-rose-300' : stato === 'vicina' ? 'bg-yellow-200' : 'bg-white',
            )}
          >
            {fmtData(d)}
          </span>
        )
      })}
    </span>
  )
}
