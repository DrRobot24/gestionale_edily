import { useState } from 'react'
import { Avviso, Badge, Button, Campo, CampoArea, Card, Input, Vuoto } from '../../ui'
import { data as fmtData } from '../../lib/formato'
import { oggi } from '../rapportini/campiRapportino'
import {
  filtra,
  useEliminaNota,
  useNoteContabili,
  useSalvaNota,
  type DatiNota,
  type NotaContabile,
} from './noteContabili'

/* ══════════════════════════════════════════════════════════════════
   I lavori extra, dentro la scheda del cantiere.

   Il progetto si paga a misura: tanti metri di muro, tanto al metro. Ma
   il muro non si alza se prima non si toglie il nido d'api che nessuno
   aveva previsto, e quel lavoro si fattura a parte. Questo riquadro e'
   dove si segna il giorno che succede, perche' il mese dopo non se lo
   ricorda piu' nessuno e resta a carico dell'impresa.

   NIENTE ORE, deciso dall'utente il 2026-09-15: la contabilita' dei
   lavori extra si fa fuori dal gestionale. Qui resta il testo — cosa e'
   stato fatto, con misure e calcoli — ed e' su quello che si cerca.

   La ricerca non e' un vezzo. Un cantiere lungo accumula decine di note,
   e la domanda vera non e' «fammele vedere tutte» ma «cosa abbiamo fatto
   fuori progetto su questo cantiere». Si scrive una parola e l'elenco si
   stringe mentre si digita.
   ══════════════════════════════════════════════════════════════════ */

const VUOTA: DatiNota = { data: oggi(), descrizione: '', note: null }

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
  const filtrando = cerca.trim() !== ''

  function apriNuova() {
    setCampi(VUOTA)
    setProblema(null)
    setAperto('')
  }

  function apriCorrezione(n: NotaContabile) {
    setCampi({ data: n.data, descrizione: n.descrizione, note: n.note })
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
            Lavori extra
          </h2>
          <p className="text-xs font-semibold text-gray-700">
            Lavorazioni extra non previste dal progetto, da ribaltare al cliente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tutte.length > 0 && (
            <Badge colore="successo" className="px-3 py-1 text-xs">
              {tutte.length} {tutte.length === 1 ? 'lavorazione' : 'lavorazioni'}
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
          {/* Il giorno da solo, non piu' in fila con le ore: e' rimasto
              l'unico campo stretto della scheda. */}
          <Campo
            etichetta="Giorno"
            type="date"
            max={oggi()}
            className="sm:w-52"
            value={campi.data}
            onChange={(e) => setCampi((c) => ({ ...c, data: e.target.value }))}
          />

          {/* Un'area e non una riga: qui ci vanno misure, calcoli e
              lavori a corpo, ed e' l'unica cosa che questa scheda
              registra. */}
          <CampoArea
            etichetta="Cosa è stato fatto"
            rows={4}
            placeholder="Rimozione nido d’api prima di alzare il muro. Misure, calcoli, quantità: tutto quello che serve per fatturarlo."
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
            Qui non si segnano ore: quelle della giornata stanno nel rapportino. Questo è il
            racconto del lavoro fuori progetto, per poterlo fatturare.
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
              ? `${viste.length} ${viste.length === 1 ? 'nota' : 'note'}`
              : `${tutte.length} in tutto`}
          </p>
        </div>
      )}

      {isPending ? (
        <p className="px-5 py-4 text-sm font-bold text-gray-600">Carico le note…</p>
      ) : tutte.length === 0 ? (
        <div className="p-5">
          <Vuoto>
            Nessun lavoro extra su questo cantiere. Si segnano qui le lavorazioni che il
            progetto non prevedeva, il giorno stesso che succedono.
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
                    {fmtData(n.data)}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm font-extrabold text-black">
                    {n.descrizione}
                  </p>
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
                        // Accorciata: la descrizione ora e' un testo
                        // lungo, e un confirm() con dentro mezzo foglio
                        // di misure non si legge.
                        const breve =
                          n.descrizione.length > 60
                            ? `${n.descrizione.slice(0, 60)}…`
                            : n.descrizione
                        if (!confirm(`Togliere la nota «${breve}»?`)) return
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
