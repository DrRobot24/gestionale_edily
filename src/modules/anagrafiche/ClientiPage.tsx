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

  /* QUI STAVA `useFigureRiepilogo('cliente')`, che riempiva la colonna
     Amministratore. Tolta col 2026-09-22 insieme alla colonna: le
     figure restano nella scheda del cliente e ora anche in quella del
     cantiere, che e' dove si vanno a cercare davvero. Una query in meno
     a ogni apertura dell'elenco. */

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
        /* TRE COLONNE, non cinque. Il 2026-09-22 l'utente ha tolto
           Comune — «non e' un dato interessante»: il lavoro si fa in
           cantiere, e il comune del cliente non serve a riconoscerlo —
           e Amministratore, che e' passato fra le figure del cantiere.

           `table-fixed` con le larghezze dichiarate: a layout
           automatico il browser dimensiona ogni colonna sul contenuto,
           e le righe con una mail lunga spostavano le colonne rispetto
           a quelle con un trattino. Stesso rimedio di Risorse. */
        <Table className="table-fixed">
          <colgroup>
            <col />
            <col className="w-44" />
            <col className="w-80" />
            <col className="w-24" />
          </colgroup>

          <thead>
            <tr>
              <th>Ragione sociale</th>
              <th>Partita IVA</th>
              <th>Contatti</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {clienti.map((c) => (
              <tr key={c.id} className={c.attivo ? undefined : 'bg-gray-50 text-gray-500'}>
                <td className="font-semibold">
                  <span className="block truncate">
                    {c.ragione_sociale}
                    {!c.attivo && (
                      <Badge className="ml-2 px-2 py-0.5 text-[10px]">archiviato</Badge>
                    )}
                  </span>
                </td>
                <td className="numerico text-gray-600">{c.partita_iva ?? '—'}</td>
                {/* `truncate`: due indirizzi di posta su una riga sola
                    sforerebbero la colonna e spingerebbero il pulsante
                    fuori asse. Per esteso stanno nella scheda. */}
                <td className="truncate text-gray-600">{c.email ?? c.telefono ?? '—'}</td>
                <td className="!text-right">
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
