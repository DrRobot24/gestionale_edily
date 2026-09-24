import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Avviso, Badge, Button, Rubrica, Vuoto } from '../../ui'
import { usePermission } from '../auth/usePermission'
import { useClienti } from './clienti'

/** La stessa griglia per i titoli e per le righe, cosi' restano in colonna. */
const COLONNE = 'grid gap-x-6 sm:grid-cols-[2fr_3fr_1fr]'

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
        /* UN ELENCO A RUBRICA: nominativo, indirizzo e telefono, e
           basta. Dal 2026-09-24 «voglio vedere solo: nominativo,
           indirizzo e numero di telefono» — l'email, che prima faceva
           da ripiego quando mancava il telefono, esce dall'elenco e
           resta nella scheda.

           IL NOMINATIVO E' COGNOME NOME. Il form del privato chiede i
           due campi separati e compone `ragione_sociale` in quell'ordine
           (`cliente-cognome-nome.sql`), e la Rubrica ordina su quel
           testo. Per le aziende e' la ragione sociale. */
        <Rubrica
          voci={clienti}
          nome={(c) => c.ragione_sociale}
          chiave={(c) => c.id}
          spenta={(c) => !c.attivo}
          onApri={(c) => navigate(`/anagrafiche/clienti/${c.id}`)}
          intestazione={
            <div className={`${COLONNE} w-full`}>
              <span>Nominativo</span>
              <span>Indirizzo</span>
              <span>Telefono</span>
            </div>
          }
        >
          {(c) => {
            const indirizzo = indirizzoCompleto(c)
            const telefono = c.telefono?.trim()
            return (
              <div className={`${COLONNE} w-full gap-y-0.5`}>
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
                    indirizzo
                      ? 'truncate text-sm font-semibold text-gray-700'
                      : 'text-sm font-semibold text-gray-400'
                  }
                >
                  {indirizzo || 'nessun indirizzo'}
                </span>
                <span
                  className={
                    telefono
                      ? 'numerico truncate text-sm font-semibold text-gray-700'
                      : 'text-sm font-semibold text-gray-400'
                  }
                >
                  {telefono || 'nessun telefono'}
                </span>
              </div>
            )
          }}
        </Rubrica>
      )}
    </div>
  )
}

/** «Via Roma 12, Catania (CT)»: i pezzi che ci sono, nell'ordine in cui si leggono. */
function indirizzoCompleto(c: {
  indirizzo: string | null
  comune: string | null
  provincia: string | null
}) {
  const via = c.indirizzo?.trim()
  const comune = c.comune?.trim()
  const prov = c.provincia?.trim()
  const luogo = comune && prov ? `${comune} (${prov})` : comune || prov
  return [via, luogo].filter(Boolean).join(', ')
}
