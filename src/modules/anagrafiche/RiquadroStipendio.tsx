import { useState } from 'react'
import { data as fmtData, euro } from '../../lib/formato'
import { Avviso, Button, Campo, Card, Cifra, Table } from '../../ui'
import {
  stipendioVigente,
  useAggiungiStipendio,
  useEliminaStipendio,
  useStipendi,
} from './dipendenti'

/* ══════════════════════════════════════════════════════════════════
   Il SALARIO di una persona, dal 2026-09-24.

   COME LO CHIAMA L'UTENTE, e la parola conta: il salario e' «lo
   stipendio fisso pattuito a voce tra l'azienda e l'operaio», lo
   inserisce Stefania, e da li' si ricava la TARIFFA ORARIA che si
   vede nell'elenco. Non e' il NETTO, che e' quanto la persona prende
   davvero in un mese solare e sta nella pagina Economia.

   Il calcolo automatico della tariffa non c'e' ancora: la regola —
   per cosa si divide, ogni quanto si ricalcola — si decide in
   riunione. Fino ad allora la tariffa si scrive a mano.

   Nel database la tabella resta `dipendente_stipendi`: il nome del
   file e della tabella non lo legge nessuno, l'etichetta si'.

   Lo vede solo chi ha `paghe.read` — il chiamante non lo monta
   nemmeno per gli altri, e la RLS non glielo darebbe comunque.

   Funziona come le tariffe: non si corregge, si aggiunge una riga con
   la data da cui vale. Uno stipendio si CANCELLA solo se e' stato
   scritto per sbaglio, e lo si chiede prima.
   ══════════════════════════════════════════════════════════════════ */

export function RiquadroStipendio({
  dipendenteId,
  puoScrivere,
}: {
  dipendenteId: string
  puoScrivere: boolean
}) {
  const { data: stipendi, isPending, error } = useStipendi({ dipendenteId, abilitato: true })
  const aggiungi = useAggiungiStipendio()
  const elimina = useEliminaStipendio()
  const [apri, setApri] = useState(false)

  const [dal, setDal] = useState(() => new Date().toLocaleDateString('sv-SE'))
  const [importo, setImporto] = useState('')
  const [note, setNote] = useState('')
  const [problema, setProblema] = useState<string | null>(null)

  const vigente = stipendioVigente(stipendi, dipendenteId)

  function salva() {
    const n = Number(importo.replace(',', '.'))
    if (!dal) return setProblema('Serve la data da cui vale.')
    if (!(n > 0)) return setProblema('L’importo deve essere maggiore di zero.')
    setProblema(null)
    aggiungi.mutate(
      {
        dipendente_id: dipendenteId,
        valido_dal: dal,
        importo_mensile: n,
        note: note.trim() || null,
      },
      {
        onSuccess: () => {
          setApri(false)
          setImporto('')
          setNote('')
        },
      },
    )
  }

  return (
    <Card className="grid gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold text-black">Paga mensile</h2>
          <p className="text-xs font-semibold text-gray-600">
            Il fisso mensile pattuito con la persona. Quando cambia se ne aggiunge uno nuovo
            con la data da cui vale.
          </p>
        </div>
        {puoScrivere && !apri && (
          <Button dimensione="sm" onClick={() => setApri(true)}>
            Nuovo salario
          </Button>
        )}
      </div>

      {error && <Avviso tono="errore">Non riesco a leggere il salario: {error.message}</Avviso>}
      {elimina.isError && <Avviso tono="errore">{(elimina.error as Error).message}</Avviso>}

      {apri && (
        <div className="grid gap-3 rounded-xl border-2 border-black bg-amber-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo
              etichetta="Valido dal"
              type="date"
              value={dal}
              onChange={(e) => setDal(e.target.value)}
            />
            <Campo
              etichetta="Importo mensile €"
              type="number"
              step="0.01"
              min="0"
              className="numerico"
              value={importo}
              onChange={(e) => setImporto(e.target.value)}
            />
          </div>
          <Campo
            etichetta="Note"
            placeholder="Passaggio di livello, rinnovo CCNL…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {problema && <Avviso tono="errore">{problema}</Avviso>}
          {aggiungi.isError && <Avviso tono="errore">{(aggiungi.error as Error).message}</Avviso>}
          <div className="flex gap-2">
            <Button variante="primario" dimensione="sm" onClick={salva} disabled={aggiungi.isPending}>
              {aggiungi.isPending ? 'Salvo…' : 'Aggiungi salario'}
            </Button>
            <Button
              dimensione="sm"
              onClick={() => {
                aggiungi.reset()
                setProblema(null)
                setApri(false)
              }}
              disabled={aggiungi.isPending}
            >
              Annulla
            </Button>
          </div>
        </div>
      )}

      {isPending ? (
        <p className="text-sm font-semibold text-gray-600">Carico…</p>
      ) : !stipendi?.length ? (
        !apri && (
          <p className="text-sm font-semibold text-gray-600">Nessun salario inserito.</p>
        )
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Valido dal</th>
              <th className="text-right">Mensile</th>
              <th>Note</th>
              {puoScrivere && <th />}
            </tr>
          </thead>
          <tbody>
            {stipendi.map((s) => (
              <tr key={s.id} className={s.id === vigente?.id ? 'bg-lime-100' : undefined}>
                <td className="numerico font-bold">
                  {fmtData(s.valido_dal)}
                  {s.id === vigente?.id && (
                    <span className="ml-2 text-[10px] font-bold uppercase text-gray-600">
                      in vigore
                    </span>
                  )}
                </td>
                <Cifra>{euro(s.importo_mensile)}</Cifra>
                <td className="text-gray-600">{s.note ?? '—'}</td>
                {puoScrivere && (
                  <td className="text-right">
                    <button
                      type="button"
                      className="cursor-pointer text-xs font-bold text-gray-600 underline hover:text-black"
                      disabled={elimina.isPending}
                      onClick={() => {
                        if (
                          confirm(
                            `Cancellare il salario di ${euro(s.importo_mensile)} valido dal ${fmtData(s.valido_dal)}?\n\nSi cancella solo se era stato scritto per sbaglio: se il salario è cambiato, aggiungine uno nuovo.`,
                          )
                        ) {
                          elimina.mutate(s.id)
                        }
                      }}
                    >
                      cancella
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  )
}
