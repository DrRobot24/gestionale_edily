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
        /* `table-fixed` E LE LARGHEZZE, dal 2026-09-22: «allineami questi
           dati nelle colonne che cosi non si possono guardare».

           A layout automatico il browser dimensiona ogni colonna sul suo
           contenuto: le righe con un badge diventavano larghe, quelle con
           un trattino strette, e le stesse informazioni cadevano su
           verticali diverse riga per riga. Con `table-fixed` comanda il
           colgroup e le colonne stanno ferme.

           Sta qui e non nella primitiva `Table`: quella impagina anche
           elenchi dove il layout automatico e' giusto — una colonna di
           ragioni sociali deve potersi allargare. */
        <Table className="table-fixed">
          <colgroup>
            <col />
            <col className="w-28" />
            <col className="w-40" />
            {/* Assunto tiene la data E il badge del suo stato: prima
                erano due colonne, e il badge finiva a mezza pagina di
                distanza dalla data che qualifica. */}
            <col className="w-56" />
            <col className="w-32" />
            <col className="w-28" />
            <col className="w-24" />
          </colgroup>

          <thead>
            <tr>
              <th>Cognome e nome</th>
              <th>Tipo</th>
              <th>Mansione</th>
              <th>Assunto</th>
              <th className="!text-right">Costo orario</th>
              <th className="!text-right">Straord.</th>
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

                  <td className="truncate text-gray-600">{d.mansione ?? '—'}</td>

                  {/* LA DATA E IL SUO STATO NELLA STESSA CELLA.

                      Erano due colonne, e il risultato si vedeva: la
                      data a sinistra, il badge che la qualifica a mezza
                      pagina di distanza, dove l'occhio lo attribuiva
                      alla colonna del costo. Sono la stessa
                      informazione — «da quando, e a che titolo» — e
                      stanno insieme.

                      Il badge SOTTO e non accanto: le date sono brevi e
                      i badge no, e affiancandoli la colonna si
                      allargherebbe per la riga peggiore. Sotto, ogni
                      data resta incolonnata con le altre.

                      La colonna degli allarmi e' vuota quando va tutto
                      bene: un badge «assunto» su venti righe su venti
                      sarebbe inchiostro che non dice niente, e
                      farebbe saltare l'occhio anche sugli altri due. */}
                  <td className="text-gray-600">
                    <span className="numerico block">{fmtData(d.data_assunzione)}</span>
                    <span className="mt-0.5 block space-x-1 whitespace-nowrap">
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
                    </span>
                  </td>

                  {/* Nessuna tariffa non e' un dettaglio estetico: senza,
                      le ore di questa persona valgono zero euro nel
                      consuntivo del cantiere. Va gridato, non nascosto. */}
                  {/* `!text-right` anche sul badge: la primitiva `Table`
                      impone `[&_td]:...` con un selettore discendente
                      che per specificita' batte una classe sulla cella.
                      Senza, «MANCA» restava al centro mentre gli importi
                      andavano a destra — due allineamenti nella stessa
                      colonna, che e' cio' che rendeva illeggibile la
                      pagina. */}
                  {t ? (
                    <Cifra>{euro(t.costo_orario)}</Cifra>
                  ) : (
                    <td className="!text-right">
                      <Badge colore="errore" className="px-2 py-0.5 text-[10px]">
                        manca
                      </Badge>
                    </td>
                  )}
                  <Cifra className="text-gray-600">
                    {t?.costo_orario_straordinario ? euro(t.costo_orario_straordinario) : '—'}
                  </Cifra>

                  <td className="!text-right">
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
