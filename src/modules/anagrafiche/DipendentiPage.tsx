import { useState } from 'react'
import { useNavigate } from 'react-router'
import { data as fmtData, euro } from '../../lib/formato'
import { Avviso, Badge, Button, Cifra, Table, Vuoto } from '../../ui'
import { usePermission } from '../auth/usePermission'
import { tariffaVigente, useDipendenti, type TipoRisorsa } from './dipendenti'
import { statoScadenza, giorniA } from './documentiPersonali'

/* ══════════════════════════════════════════════════════════════════
   Il registro delle persone che lavorano per l'impresa.

   SI CHIAMA «RISORSE» E NON «OPERAI», dal 2026-09-18. Il nome vecchio
   era rimasto da quando qui dentro c'erano solo muratori, ma da quando
   Stefania crea anche tecnici e impiegati l'elenco conteneva un tecnico
   sotto un'intestazione che diceva «Operai» — e il pulsante prometteva
   «Nuovo operaio» per poi aprire una scheda dove si sceglie il tipo.

   Il percorso `/anagrafiche/operai` resta com'e': gli indirizzi
   girano, stanno nei preferiti, e cambiarlo romperebbe i segnalibri di
   chi lo usa da giorni per guadagnare una parola che nessuno legge.

   LE COLONNE SONO POCHE DI PROPOSITO. Un elenco serve a TROVARE una
   persona e a vedere cosa non va, non a raccontarla: il resto sta nella
   scheda. Le due colonne di allarme — stato del rapporto e permesso —
   restano vuote quando non c'e' niente da dire, che e' la stessa regola
   della home: si mostra solo cio' che chiede un'azione.
   ══════════════════════════════════════════════════════════════════ */

/** Come si chiama un tipo, in una parola. La tendina della scheda dice
 *  «Operaio — va in cantiere»: qui la spiegazione non serve, perche' in
 *  una tabella la colonna e' gia' il contesto. */
const TIPI: Record<TipoRisorsa, { etichetta: string; colore: 'primario' | 'info' | 'accento' }> = {
  operaio: { etichetta: 'Operaio', colore: 'primario' },
  tecnico: { etichetta: 'Tecnico', colore: 'info' },
  impiegato: { etichetta: 'Impiegato', colore: 'accento' },
}

export function DipendentiPage() {
  const navigate = useNavigate()
  const [conArchiviati, setConArchiviati] = useState(false)
  const puoScrivere = usePermission('anagrafiche.write')

  const { data: dipendenti, isPending, error } = useDipendenti({ soloAttivi: !conArchiviati })

  if (isPending) return <p className="text-sm font-bold text-gray-600">Carico le risorse…</p>
  if (error) {
    return <Avviso tono="errore">Non riesco a leggere le risorse: {error.message}</Avviso>
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-black">Risorse</h1>
          <p className="text-xs font-semibold text-gray-600">
            {dipendenti.length} in elenco · operai, tecnici e impiegati
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
            <Button variante="primario" onClick={() => navigate('/anagrafiche/operai/nuovo')}>
              Nuova risorsa
            </Button>
          )}
        </div>
      </div>

      {dipendenti.length === 0 ? (
        <Vuoto>
          Nessuna risorsa in anagrafica. Qui vanno gli operai che vanno in cantiere, i
          tecnici che li seguono e chi lavora in ufficio.
        </Vuoto>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Cognome e nome</th>
              <th>Tipo</th>
              <th>Mansione</th>
              <th>Assunto</th>
              {/* Senza intestazione: e' la colonna degli allarmi, e la
                  maggior parte delle volte e' vuota. Intitolarla
                  vorrebbe dire una parola fissa sopra il nulla. */}
              <th />
              <th className="text-right">Costo orario</th>
              <th className="text-right">Straord.</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {dipendenti.map((d) => {
              const t = tariffaVigente(d.dipendente_costi)
              const tipo = TIPI[d.tipo] ?? TIPI.operaio
              const permesso = d.permesso_soggiorno ? statoScadenza(d.permesso_scadenza) : null

              return (
                <tr key={d.id} className={d.attivo ? undefined : 'bg-gray-50 text-gray-500'}>
                  <td className="font-semibold">
                    {d.cognome} {d.nome}
                    {!d.attivo && (
                      <Badge className="ml-2 px-2 py-0.5 text-[10px]">archiviato</Badge>
                    )}
                  </td>

                  {/* IL TIPO, che e' il dato che manca di piu': decide se
                      una persona puo' stare nella squadra di un cantiere,
                      e senza questa colonna un tecnico e un muratore si
                      leggono uguali. */}
                  <td>
                    <Badge colore={tipo.colore} className="px-2 py-0.5 text-[10px]">
                      {tipo.etichetta}
                    </Badge>
                  </td>

                  <td className="text-gray-600">{d.mansione ?? '—'}</td>
                  <td className="numerico text-gray-600">{fmtData(d.data_assunzione)}</td>

                  {/* LA COLONNA DEGLI ALLARMI, vuota quando va tutto bene.

                      Due cose che chiedono di fare qualcosa: un contratto
                      che manca e un permesso che sta per scadere. Un
                      badge «assunto» su venti righe su venti sarebbe
                      inchiostro che non dice niente, e finirebbe per far
                      saltare l'occhio anche sugli altri due. */}
                  <td className="space-x-1 whitespace-nowrap">
                    {d.stato_rapporto === 'da_inquadrare' && (
                      <Badge colore="errore" className="px-2 py-0.5 text-[10px]">
                        da inquadrare
                      </Badge>
                    )}
                    {d.stato_rapporto === 'in_prova' && (
                      <Badge colore="attesa" className="px-2 py-0.5 text-[10px]">
                        in prova
                      </Badge>
                    )}
                    {permesso === 'scaduto' && (
                      <Badge colore="errore" className="px-2 py-0.5 text-[10px]">
                        permesso scaduto
                      </Badge>
                    )}
                    {permesso === 'in-scadenza' && d.permesso_scadenza && (
                      <Badge colore="attesa" className="px-2 py-0.5 text-[10px]">
                        permesso: {giorniA(d.permesso_scadenza)} gg
                      </Badge>
                    )}
                  </td>

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
