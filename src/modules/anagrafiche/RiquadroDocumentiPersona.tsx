import { useRef, useState } from 'react'
import { Avviso, Badge, Button, Campo, Card, Vuoto } from '../../ui'
import { data as fmtData } from '../../lib/formato'
import {
  giorniA,
  statoScadenza,
  useCaricaDocumento,
  useDocumentiPersonali,
  useEliminaDocumento,
} from './documentiPersonali'

/* ══════════════════════════════════════════════════════════════════
   I documenti della persona: patentini, attestati, identita'.

   Chiesti dall'utente il 2026-09-18. Il file sale nel bucket
   `personale`, che e' chiuso: gli indirizzi si firmano a ogni lettura e
   scadono dopo un'ora, perche' dentro ci sono carte d'identita' e
   permessi di soggiorno.

   LE SCADENZE SI VEDONO PRIMA, ed e' il motivo per cui il riquadro non
   e' un semplice elenco di allegati: un attestato scaduto e' un operaio
   che non puo' salire sul ponteggio, e scoprirlo il giorno del
   controllo e' tardi. Scaduto in rosso, in scadenza entro trenta giorni
   in ambra.

   Esiste solo su una scheda GIA' SALVATA: un documento ha bisogno di
   una persona a cui appartenere, e su una scheda nuova quella persona
   non ha ancora un id.
   ══════════════════════════════════════════════════════════════════ */

// SI CHIAMA «...Persona» dal 2026-09-18, da quando esiste il riquadro
// generico in `modules/documenti/`. Due componenti con lo stesso nome in
// cartelle diverse sono una trappola: chi importa quello sbagliato non se
// ne accorge finche' non vede la scheda vuota.
export function RiquadroDocumentiPersona({
  dipendenteId,
  puoScrivere,
}: {
  dipendenteId: string
  puoScrivere: boolean
}) {
  const { data: documenti, isPending, error } = useDocumentiPersonali(dipendenteId)
  const carica = useCaricaDocumento()
  const elimina = useEliminaDocumento()

  const [apri, setApri] = useState(false)
  const [titolo, setTitolo] = useState('')
  const [scadenza, setScadenza] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [problema, setProblema] = useState<string | null>(null)
  const campoFile = useRef<HTMLInputElement>(null)

  function annulla() {
    setApri(false)
    setTitolo('')
    setScadenza('')
    setFile(null)
    setProblema(null)
    if (campoFile.current) campoFile.current.value = ''
  }

  function conferma() {
    if (!file) {
      setProblema('Scegli il file da caricare.')
      return
    }
    if (titolo.trim() === '') {
      setProblema('Dagli un nome: «Attestato ponteggi», «Carta d’identità».')
      return
    }
    // Lo stesso limite del bucket, detto qui perche' un rifiuto dello
    // storage arriva come errore tecnico dopo aver caricato per un
    // minuto.
    if (file.size > 20 * 1024 * 1024) {
      setProblema('Il file supera i 20 MB: se è una scansione, riducila prima.')
      return
    }

    carica.mutate(
      {
        dipendenteId,
        file,
        titolo: titolo.trim(),
        scadenza: scadenza || null,
      },
      { onSuccess: annulla },
    )
  }

  const righe = documenti ?? []

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black bg-amber-100 px-5 py-2.5">
        <div>
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-black">
            Documenti
          </h2>
          <p className="text-xs font-semibold text-gray-700">
            Patentini, qualifiche, attestati, documento d&rsquo;identità.
          </p>
        </div>
        {puoScrivere && !apri && (
          <Button dimensione="sm" variante="primario" onClick={() => setApri(true)}>
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

      {apri && (
        <div className="grid gap-3 border-b-2 border-black bg-amber-50 p-5">
          <label className="grid gap-1.5">
            <span className="text-xs font-bold uppercase">File</span>
            <input
              ref={campoFile}
              type="file"
              accept=".pdf,image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-xl border-2 border-black bg-white px-3 py-2 text-sm font-semibold file:mr-3 file:cursor-pointer file:rounded-lg file:border-2 file:border-black file:bg-amber-200 file:px-3 file:py-1 file:text-sm file:font-bold"
            />
            <span className="text-xs font-semibold text-gray-600">
              PDF o immagine, fino a 20 MB.
            </span>
          </label>

          <Campo
            etichetta="Come si chiama"
            placeholder="Attestato ponteggi, Carta d’identità…"
            suggerimento="Il nome con cui lo cercherai fra un anno, non quello del file."
            value={titolo}
            onChange={(e) => setTitolo(e.target.value)}
          />

          {/* Facoltativa perche' non tutto scade: una carta d'identita'
              si', un attestato di qualifica no. */}
          <Campo
            etichetta="Scade il"
            type="date"
            className="sm:w-56"
            suggerimento="Lascia vuoto se non scade."
            value={scadenza}
            onChange={(e) => setScadenza(e.target.value)}
          />

          {problema && <Avviso tono="errore">{problema}</Avviso>}
          {carica.isError && (
            <Avviso tono="errore">{(carica.error as Error).message}</Avviso>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variante="primario"
              dimensione="sm"
              disabled={carica.isPending}
              onClick={conferma}
            >
              {carica.isPending ? 'Carico…' : 'Carica'}
            </Button>
            <Button dimensione="sm" onClick={annulla} disabled={carica.isPending}>
              Annulla
            </Button>
          </div>
        </div>
      )}

      {isPending ? (
        <p className="px-5 py-4 text-sm font-bold text-gray-600">Carico i documenti…</p>
      ) : righe.length === 0 ? (
        <div className="p-5">
          <Vuoto>
            Nessun documento. Qui vanno patentini, attestati di formazione e il documento
            d&rsquo;identità: restano legati a questa persona.
          </Vuoto>
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
                        <Badge colore="errore">
                          scaduto il {fmtData(d.scadenza)}
                        </Badge>
                      ) : stato === 'in-scadenza' ? (
                        <Badge colore="attesa">
                          scade fra {giorniA(d.scadenza)} giorni
                        </Badge>
                      ) : (
                        <>scade il {fmtData(d.scadenza)}</>
                      )}
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
                    <Button
                      dimensione="sm"
                      variante="danger"
                      disabled={elimina.isPending}
                      onClick={() => {
                        if (!confirm(`Eliminare «${d.titolo}»?`)) return
                        elimina.mutate({ id: d.id, percorso: d.percorso, dipendenteId })
                      }}
                    >
                      ×
                    </Button>
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
