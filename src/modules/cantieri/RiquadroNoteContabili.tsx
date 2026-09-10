import { useState } from 'react'
import { Avviso, Badge, Button, Campo, CampoArea, Card, Input, Vuoto } from '../../ui'
import { data as fmtData, numero as fmtNumero } from '../../lib/formato'
import { oggi } from '../rapportini/campiRapportino'
import {
  filtra,
  sommaOre,
  useEliminaNota,
  useNoteContabili,
  useSalvaNota,
  type DatiNota,
  type NotaContabile,
} from './noteContabili'

/* ══════════════════════════════════════════════════════════════════
   Le ore in economia, dentro la scheda del cantiere.

   Il progetto si paga a misura: tanti metri di muro, tanto al metro. Ma
   il muro non si alza se prima non si toglie il nido d'api che nessuno
   aveva previsto, e quelle due ore si fatturano a parte. Questo riquadro
   e' dove si segnano il giorno che succedono, perche' il mese dopo non
   se le ricorda piu' nessuno e restano a carico dell'impresa.

   La ricerca non e' un vezzo. Un cantiere lungo accumula decine di note,
   e la domanda vera non e' «fammele vedere tutte» ma «quante ore di
   economia abbiamo su questo cantiere, e per cosa». Si scrive una parola
   e l'elenco si stringe mentre si digita, con il conto delle ore di
   quello che resta.
   ══════════════════════════════════════════════════════════════════ */

const VUOTA: DatiNota = { data: oggi(), descrizione: '', ore: 0, note: null }

export function RiquadroNoteContabili({
  cantiereId,
  puoScrivere,
}: {
  cantiereId: string
  puoScrivere: boolean
}) {
  const { data: note, isPending, error } = useNoteContabili(cantiereId)
  const salva = useSalvaNota()
  const elimina = useEliminaNota()

  const [cerca, setCerca] = useState('')

  /** `null` = chiuso, `''` = aperto su una nota nuova, un id = aperto in
   *  correzione su quella nota. Un solo stato invece di due booleani che
   *  possono contraddirsi. */
  const [aperto, setAperto] = useState<string | null>(null)
  const [campi, setCampi] = useState<DatiNota>(VUOTA)
  const [problema, setProblema] = useState<string | null>(null)

  const tutte = note ?? []
  const viste = filtra(tutte, cerca)
  const oreTotali = sommaOre(tutte)
  const oreViste = sommaOre(viste)
  const filtrando = cerca.trim() !== ''

  function apriNuova() {
    setCampi(VUOTA)
    setProblema(null)
    setAperto('')
  }

  function apriCorrezione(n: NotaContabile) {
    setCampi({ data: n.data, descrizione: n.descrizione, ore: Number(n.ore), note: n.note })
    setProblema(null)
    setAperto(n.id)
  }

  function conferma() {
    /* Gli stessi controlli che ha il database, ripetuti qui perche' un
       23514 di Postgres non e' una frase leggibile. Quelli veri restano
       i suoi: questi servono solo a dirlo meglio. */
    if (campi.descrizione.trim() === '') {
      setProblema('Scrivi cosa è stato fatto e perché non era previsto.')
      return
    }
    if (!(campi.ore > 0)) {
      setProblema('Quante ore? Una nota da zero ore non si può ribaltare a nessuno.')
      return
    }
    if (campi.ore > 24) {
      setProblema('Più di 24 ore in un giorno solo: controlla il numero.')
      return
    }

    salva.mutate(
      {
        id: aperto || undefined,
        cantiereId,
        dati: {
          ...campi,
          descrizione: campi.descrizione.trim(),
          note: campi.note?.trim() || null,
        },
      },
      { onSuccess: () => setAperto(null) },
    )
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black bg-lime-100 px-5 py-3">
        <div>
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-black">
            Note contabili — ore in economia
          </h2>
          <p className="text-xs font-semibold text-gray-700">
            Lavorazioni extra non previste dal progetto, da ribaltare al cliente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {oreTotali > 0 && (
            <Badge colore="successo" className="px-3 py-1 text-xs">
              {fmtNumero(oreTotali)} ore
            </Badge>
          )}
          {puoScrivere && aperto === null && (
            <Button dimensione="sm" variante="primario" onClick={apriNuova}>
              + Aggiungi
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-5 py-3">
          <Avviso tono="errore">Non riesco a leggere le note: {error.message}</Avviso>
        </div>
      )}

      {aperto !== null && (
        <div className="grid gap-3 border-b-2 border-black bg-amber-50 p-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Campo
              etichetta="Giorno"
              type="date"
              max={oggi()}
              value={campi.data}
              onChange={(e) => setCampi((c) => ({ ...c, data: e.target.value }))}
            />
            <Campo
              etichetta="Ore in economia"
              type="number"
              min={0}
              max={24}
              step={0.5}
              inputMode="decimal"
              className="numerico sm:w-36"
              value={campi.ore}
              onChange={(e) => setCampi((c) => ({ ...c, ore: Number(e.target.value) }))}
            />
          </div>

          <Campo
            etichetta="Cosa è stato fatto"
            placeholder="Rimozione nido d’api prima di alzare il muro"
            suggerimento="Scrivilo per esteso: è il testo su cui si cerca, e fra sei mesi le sigle non le ricorda nessuno."
            value={campi.descrizione}
            onChange={(e) => setCampi((c) => ({ ...c, descrizione: e.target.value }))}
          />

          <CampoArea
            etichetta="Note"
            rows={3}
            placeholder="Chi c’era, cosa è servito, cosa ha detto il cliente."
            value={campi.note ?? ''}
            onChange={(e) => setCampi((c) => ({ ...c, note: e.target.value }))}
          />

          {problema && <Avviso tono="errore">{problema}</Avviso>}
          {salva.isError && <Avviso tono="errore">{(salva.error as Error).message}</Avviso>}

          <div className="flex flex-wrap gap-2">
            <Button
              variante="primario"
              dimensione="sm"
              disabled={salva.isPending}
              onClick={conferma}
            >
              {salva.isPending ? 'Salvo…' : aperto ? 'Salva le correzioni' : 'Aggiungi la nota'}
            </Button>
            <Button dimensione="sm" onClick={() => setAperto(null)}>
              Annulla
            </Button>
          </div>

          {/* Il fraintendimento piu' facile di tutta la sezione, detto
              dove serve invece che in un manuale che nessuno legge. */}
          <p className="text-xs font-semibold text-gray-600">
            Queste ore non si sommano a quelle del rapportino: sono le stesse ore, segnate qui
            perché si fatturano a parte.
          </p>
        </div>
      )}

      {elimina.isError && (
        <div className="px-5 py-3">
          <Avviso tono="errore">
            Non riesco a togliere la nota: {(elimina.error as Error).message}
          </Avviso>
        </div>
      )}

      {/* La ricerca compare quando c'e' qualcosa da cercare. Con due note
          in elenco una casella di ricerca e' un ostacolo, non un aiuto. */}
      {tutte.length > 2 && (
        <div className="flex flex-wrap items-center gap-3 border-b-2 border-black bg-white px-5 py-3">
          <label className="flex min-w-0 flex-1 items-center gap-2">
            <span aria-hidden="true" className="text-sm font-extrabold text-gray-500">
              ⌕
            </span>
            <Input
              type="search"
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
              placeholder="Cerca fra le note: una parola, o più di una"
              className="w-full py-1.5 text-sm"
            />
          </label>
          <p className="shrink-0 text-xs font-bold text-gray-600">
            {filtrando
              ? `${viste.length} ${viste.length === 1 ? 'nota' : 'note'} · ${fmtNumero(oreViste)} ore`
              : `${tutte.length} in tutto`}
          </p>
        </div>
      )}

      {isPending ? (
        <p className="px-5 py-4 text-sm font-bold text-gray-600">Carico le note…</p>
      ) : tutte.length === 0 ? (
        <div className="p-5">
          <Vuoto>
            Nessuna ora in economia su questo cantiere. Si segnano qui le lavorazioni extra che
            il progetto non prevedeva, il giorno stesso che succedono.
          </Vuoto>
        </div>
      ) : viste.length === 0 ? (
        <p className="px-5 py-4 text-sm font-semibold text-gray-600">
          Nessuna nota contiene «{cerca.trim()}».
        </p>
      ) : (
        <ul className="divide-y-2 divide-black">
          {viste.map((n) => (
            <li key={n.id} className="px-5 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-600">
                    {fmtData(n.data)} · <span className="text-black">{fmtNumero(n.ore)} ore</span>
                  </p>
                  <p className="mt-0.5 text-sm font-extrabold text-black">{n.descrizione}</p>
                </div>

                {puoScrivere && (
                  <div className="flex shrink-0 items-center gap-2">
                    <Button dimensione="sm" onClick={() => apriCorrezione(n)}>
                      Correggi
                    </Button>
                    <Button
                      dimensione="sm"
                      variante="danger"
                      disabled={elimina.isPending}
                      onClick={() => {
                        if (!confirm(`Togliere la nota «${n.descrizione}»?`)) return
                        elimina.mutate({ id: n.id, cantiereId })
                      }}
                    >
                      ×
                    </Button>
                  </div>
                )}
              </div>

              {n.note && (
                <p className="mt-1.5 whitespace-pre-wrap text-sm font-semibold text-gray-700">
                  {n.note}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
