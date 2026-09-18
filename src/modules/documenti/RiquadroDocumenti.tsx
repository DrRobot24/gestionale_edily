import { useRef, useState } from 'react'
import { Avviso, Badge, Button, Campo, CampoArea, Card, Vuoto } from '../../ui'
import { data as fmtData } from '../../lib/formato'
import { giorniA, statoScadenza } from '../anagrafiche/documentiPersonali'
import {
  useCaricaDocumento,
  useCorreggiDocumento,
  useDocumenti,
  useEliminaDocumento,
  type AmbitoDocumento,
  type Documento,
} from './documenti'

/* ══════════════════════════════════════════════════════════════════
   Il riquadro dei documenti, uguale in quattro posti.

   Sta nella scheda del cantiere, del cliente, del fornitore e del
   materiale. Un componente solo perche' il gesto e' identico —
   carica, guarda, correggi, togli — e quattro copie divergerebbero al
   primo difetto corretto in una sola.

   CHI PUO' SCRIVERE lo decide chi lo usa, passando `puoScrivere`: alla
   Edily Stefania e il titolare. Ma il cancello vero e' la RLS, non
   questo prop — nasconderei solo i pulsanti, il database rifiuta
   davvero.

   LE SCADENZE SI VEDONO PRIMA. Un documento scaduto non e' un dettaglio
   d'archivio: un certificato scaduto puo' fermare un cantiere, e
   accorgersene il giorno del controllo e' tardi. Rosso se e' passata,
   ambra entro trenta giorni — il tempo che serve per rifare un
   documento, che non e' un pomeriggio.
   ══════════════════════════════════════════════════════════════════ */

/** Le parole cambiano col posto: su un cantiere si cercano computi e
 *  disegni, su un cliente contratti. Il suggerimento giusto e' quello
 *  che nomina le cose che quella persona ha davvero in mano. */
const ESEMPI: Record<AmbitoDocumento, string> = {
  cantiere: 'Computi, disegni, permessi, verbali di cantiere.',
  cliente: 'Contratti, preventivi accettati, corrispondenza.',
  fornitore: 'Listini, condizioni di fornitura, certificazioni.',
  materiale: 'Schede tecniche, certificati, dichiarazioni di conformità.',
}

const PLACEHOLDER: Record<AmbitoDocumento, string> = {
  cantiere: 'Computo metrico, Permesso di costruire…',
  cliente: 'Contratto 2026, Preventivo accettato…',
  fornitore: 'Listino 2026, Condizioni di pagamento…',
  materiale: 'Scheda tecnica, Certificato CE…',
}

type Props = {
  ambito: AmbitoDocumento
  riferimentoId: string
  puoScrivere: boolean
}

export function RiquadroDocumenti({ ambito, riferimentoId, puoScrivere }: Props) {
  const { data: documenti, isPending, error } = useDocumenti(ambito, riferimentoId)
  const carica = useCaricaDocumento()
  const correggi = useCorreggiDocumento()
  const elimina = useEliminaDocumento()

  /** `null` = chiuso, `''` = aperto su uno nuovo, un id = in correzione.
   *  Un solo stato invece di due booleani che possono contraddirsi. */
  const [aperto, setAperto] = useState<string | null>(null)
  const [titolo, setTitolo] = useState('')
  const [scadenza, setScadenza] = useState('')
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [problema, setProblema] = useState<string | null>(null)
  const campoFile = useRef<HTMLInputElement>(null)

  const righe = documenti ?? []
  const inCorrezione = aperto !== null && aperto !== ''

  function chiudi() {
    setAperto(null)
    setTitolo('')
    setScadenza('')
    setNote('')
    setFile(null)
    setProblema(null)
    if (campoFile.current) campoFile.current.value = ''
  }

  function apriNuovo() {
    chiudi()
    setAperto('')
  }

  function apriCorrezione(d: Documento) {
    setFile(null)
    setTitolo(d.titolo)
    setScadenza(d.scadenza ?? '')
    setNote(d.note ?? '')
    setProblema(null)
    setAperto(d.id)
  }

  function conferma() {
    if (titolo.trim() === '') {
      setProblema('Dagli un nome: è quello con cui lo cercherai fra un anno.')
      return
    }

    const comuni = {
      titolo: titolo.trim(),
      scadenza: scadenza || null,
      note: note.trim() || null,
    }

    if (inCorrezione) {
      correggi.mutate(
        { id: aperto, ambito, riferimentoId, ...comuni },
        { onSuccess: chiudi },
      )
      return
    }

    if (!file) {
      setProblema('Scegli il file da caricare.')
      return
    }
    // Lo stesso limite del bucket, detto qui perche' un rifiuto dello
    // storage arriva come errore tecnico dopo aver caricato per un
    // minuto.
    if (file.size > 50 * 1024 * 1024) {
      setProblema('Il file supera i 50 MB: se è una scansione, riducila prima.')
      return
    }

    carica.mutate({ ambito, riferimentoId, file, ...comuni }, { onSuccess: chiudi })
  }

  const inCorso = carica.isPending || correggi.isPending

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black bg-amber-100 px-5 py-2.5">
        <div>
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-black">
            Documenti
          </h2>
          <p className="text-xs font-semibold text-gray-700">{ESEMPI[ambito]}</p>
        </div>
        {puoScrivere && aperto === null && (
          <Button dimensione="sm" variante="primario" onClick={apriNuovo}>
            + Carica
          </Button>
        )}
      </div>

      {error && (
        <div className="px-5 py-3">
          <Avviso tono="errore">Non riesco a leggere i documenti: {error.message}</Avviso>
        </div>
      )}
      {elimina.isError && (
        <div className="px-5 py-3">
          <Avviso tono="errore">
            Non riesco a togliere il documento: {(elimina.error as Error).message}
          </Avviso>
        </div>
      )}

      {aperto !== null && (
        <div className="grid gap-3 border-b-2 border-black bg-amber-50 p-5">
          {/* IN CORREZIONE IL FILE NON SI TOCCA. Sostituirlo vorrebbe
              dire che l'indirizzo resta lo stesso e il contenuto cambia
              sotto i piedi di chi l'aveva aperto: un documento sbagliato
              si toglie e si ricarica. */}
          {!inCorrezione && (
            <label className="grid gap-1.5">
              <span className="text-xs font-bold uppercase">File</span>
              <input
                ref={campoFile}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full rounded-xl border-2 border-black bg-white px-3 py-2 text-sm font-semibold file:mr-3 file:cursor-pointer file:rounded-lg file:border-2 file:border-black file:bg-amber-200 file:px-3 file:py-1 file:text-sm file:font-bold"
              />
              <span className="text-xs font-semibold text-gray-600">
                PDF, Word, Excel o immagine, fino a 50 MB.
              </span>
            </label>
          )}

          <Campo
            etichetta="Come si chiama"
            placeholder={PLACEHOLDER[ambito]}
            suggerimento="Il nome con cui lo cercherai fra un anno, non quello del file."
            value={titolo}
            onChange={(e) => setTitolo(e.target.value)}
          />

          <Campo
            etichetta="Scade il"
            type="date"
            className="sm:w-56"
            suggerimento="Lascia vuoto se non scade."
            value={scadenza}
            onChange={(e) => setScadenza(e.target.value)}
          />

          <CampoArea
            etichetta="Note"
            rows={2}
            placeholder="A cosa si riferisce, cosa c’è da sapere…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          {problema && <Avviso tono="errore">{problema}</Avviso>}
          {carica.isError && <Avviso tono="errore">{(carica.error as Error).message}</Avviso>}
          {correggi.isError && (
            <Avviso tono="errore">{(correggi.error as Error).message}</Avviso>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variante="primario" dimensione="sm" disabled={inCorso} onClick={conferma}>
              {inCorso ? 'Salvo…' : inCorrezione ? 'Salva le correzioni' : 'Carica'}
            </Button>
            <Button dimensione="sm" onClick={chiudi} disabled={inCorso}>
              Annulla
            </Button>
          </div>
        </div>
      )}

      {isPending ? (
        <p className="px-5 py-4 text-sm font-bold text-gray-600">Carico i documenti…</p>
      ) : righe.length === 0 ? (
        <div className="p-5">
          <Vuoto>Nessun documento. {ESEMPI[ambito]}</Vuoto>
        </div>
      ) : (
        <ul className="divide-y-2 divide-black">
          {righe.map((d) => {
            const stato = statoScadenza(d.scadenza)
            return (
              <li
                key={d.id}
                className="flex flex-wrap items-start justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-black">{d.titolo}</p>

                  {d.scadenza && (
                    <p className="mt-0.5 text-xs font-semibold text-gray-600">
                      {stato === 'scaduto' ? (
                        <Badge colore="errore" className="px-2 py-0.5 text-[10px]">
                          scaduto il {fmtData(d.scadenza)}
                        </Badge>
                      ) : stato === 'in-scadenza' ? (
                        <Badge colore="attesa" className="px-2 py-0.5 text-[10px]">
                          scade fra {giorniA(d.scadenza)} giorni
                        </Badge>
                      ) : (
                        <>scade il {fmtData(d.scadenza)}</>
                      )}
                    </p>
                  )}

                  {d.note && (
                    <p className="mt-1 whitespace-pre-wrap text-xs font-semibold text-gray-600">
                      {d.note}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {/* `rel="noreferrer"`: l'indirizzo firmato non deve
                      finire nell'header Referer di un altro sito. */}
                  {d.url && (
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      className="neo-press cursor-pointer rounded-xl border-2 border-black bg-white px-3 py-1.5 text-xs font-extrabold hover:bg-amber-100"
                    >
                      Apri
                    </a>
                  )}
                  {puoScrivere && (
                    <>
                      <Button dimensione="sm" onClick={() => apriCorrezione(d)}>
                        Correggi
                      </Button>
                      <Button
                        dimensione="sm"
                        variante="danger"
                        disabled={elimina.isPending}
                        onClick={() => {
                          const breve =
                            d.titolo.length > 60 ? `${d.titolo.slice(0, 60)}…` : d.titolo
                          if (!confirm(`Eliminare «${breve}»?`)) return
                          elimina.mutate({
                            id: d.id,
                            percorso: d.percorso,
                            ambito,
                            riferimentoId,
                          })
                        }}
                      >
                        ×
                      </Button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
