import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Avviso, Badge, Button, Rubrica, Vuoto } from '../../ui'
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
        /* UN ELENCO A RUBRICA, dal 2026-09-23: il nome e un recapito, e
           basta. «Per i clienti un elenco con nome e numero di telefono
           oppure email di contatto e basta». Tipo, cantieri aperti e
           figure stanno nella scheda del cliente, che si apre premendo
           la riga.

           UN RECAPITO SOLO, il telefono prima dell'email: e' quello che
           si usa per chiamare dal cantiere. L'email compare quando il
           telefono non c'e'. */
        <Rubrica
          voci={clienti}
          nome={(c) => c.ragione_sociale}
          chiave={(c) => c.id}
          spenta={(c) => !c.attivo}
          onApri={(c) => navigate(`/anagrafiche/clienti/${c.id}`)}
        >
          {(c) => {
            const contatto = c.telefono?.trim() || c.email?.trim()
            return (
              <div className="grid w-full gap-x-6 gap-y-0.5 sm:grid-cols-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-extrabold text-black">
                    {c.ragione_sociale}
                  </span>
                  {!c.attivo && (
                    <Badge className="shrink-0 px-2 py-0.5 text-[10px]">archiviato</Badge>
                  )}
                </span>
                <span
                  className={
                    contatto
                      ? 'numerico truncate text-sm font-semibold text-gray-700'
                      : 'text-sm font-semibold text-gray-400'
                  }
                >
                  {contatto ?? 'nessun recapito'}
                </span>
              </div>
            )
          }}
        </Rubrica>
      )}
    </div>
  )
}
