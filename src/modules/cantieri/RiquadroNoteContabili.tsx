import { useState } from 'react'
import { Avviso, Badge, Button, Campo, CampoArea, CampoSelect, Card, Vuoto, cn } from '../../ui'
import { data as fmtData } from '../../lib/formato'
import { oggi } from '../rapportini/campiRapportino'
import {
  ETICHETTA_STATO,
  STATI_NOTA,
  useEliminaNota,
  useNoteContabili,
  useSalvaNota,
  type DatiNota,
  type NotaContabile,
  type StatoNota,
} from './noteContabili'

/* ══════════════════════════════════════════════════════════════════
   L'avanzamento delle lavorazioni, dentro la scheda del cantiere.

   Il rapportino risponde a «chi c'era e quante ore ha fatto». Questa
   sezione risponde all'altra domanda, quella che finora non aveva un
   posto: «a che punto siamo». La posa del pavimento e' finita, i
   battiscopa cominciano lunedi', l'intonaco e' fermo perche' aspetta il
   ponteggio.

   Sono due domande diverse e servono tutte e due: dalle ore non si
   ricava l'avanzamento, e dall'avanzamento non si ricavano le paghe.

   In cima quello che e' ancora aperto, sotto quello che e' fatto. Chi
   apre questa pagina vuole sapere dove sta il lavoro adesso, e un elenco
   in ordine di inserimento sotterrerebbe la lavorazione di oggi sotto
   tre mesi di storia.
   ══════════════════════════════════════════════════════════════════ */

const COLORE: Record<StatoNota, Parameters<typeof Badge>[0]['colore']> = {
  in_corso: 'info',
  completata: 'successo',
  sospesa: 'attesa',
}

const VUOTA: DatiNota = {
  lavorazione: '',
  stato: 'in_corso',
  iniziata_il: oggi(),
  completata_il: null,
  note: null,
}

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

  /** `null` = chiuso, `''` = aperto su una nota nuova, un id = aperto in
   *  correzione su quella nota. Un solo stato invece di due booleani che
   *  possono contraddirsi. */
  const [aperto, setAperto] = useState<string | null>(null)
  const [campi, setCampi] = useState<DatiNota>(VUOTA)
  const [problema, setProblema] = useState<string | null>(null)

  function apriNuova() {
    setCampi(VUOTA)
    setProblema(null)
    setAperto('')
  }

  function apriCorrezione(n: NotaContabile) {
    setCampi({
      lavorazione: n.lavorazione,
      stato: n.stato,
      iniziata_il: n.iniziata_il,
      completata_il: n.completata_il,
      note: n.note,
    })
    setProblema(null)
    setAperto(n.id)
  }

  function conferma() {
    /* Gli stessi controlli che ha il database, ripetuti qui perche' il
       23514 di Postgres non e' una frase leggibile. Quelli veri restano
       i suoi: questi servono solo a dirlo meglio. */
    if (campi.lavorazione.trim() === '') {
      setProblema('Scrivi che lavorazione è.')
      return
    }
    if (campi.stato === 'completata' && !campi.completata_il) {
      setProblema('Una lavorazione completata ha una data di fine: mettila.')
      return
    }
    if (campi.iniziata_il && campi.completata_il && campi.completata_il < campi.iniziata_il) {
      setProblema('La fine non può venire prima dell’inizio.')
      return
    }

    salva.mutate(
      {
        id: aperto || undefined,
        cantiereId,
        dati: {
          ...campi,
          lavorazione: campi.lavorazione.trim(),
          note: campi.note?.trim() || null,
          // Una lavorazione che torna in corso non tiene la data di fine
          // che aveva: sarebbe una fine che non e' mai avvenuta.
          completata_il: campi.stato === 'completata' ? campi.completata_il : null,
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
            Note contabili
          </h2>
          <p className="text-xs font-semibold text-gray-700">
            A che punto sono le singole lavorazioni di questo cantiere.
          </p>
        </div>
        {puoScrivere && aperto === null && (
          <Button dimensione="sm" variante="primario" onClick={apriNuova}>
            + Aggiungi
          </Button>
        )}
      </div>

      {error && (
        <div className="px-5 py-3">
          <Avviso tono="errore">Non riesco a leggere le note: {error.message}</Avviso>
        </div>
      )}

      {aperto !== null && (
        <div className="grid gap-3 border-b-2 border-black bg-amber-50 p-5">
          <Campo
            etichetta="Lavorazione"
            placeholder="Posa in opera pavimento — piano primo"
            value={campi.lavorazione}
            onChange={(e) => setCampi((c) => ({ ...c, lavorazione: e.target.value }))}
          />

          <div className="grid gap-3 sm:grid-cols-3">
            <CampoSelect
              etichetta="Stato"
              value={campi.stato}
              onChange={(e) =>
                setCampi((c) => {
                  const stato = e.target.value as StatoNota
                  return {
                    ...c,
                    stato,
                    // Segnandola completata la data di fine si propone
                    // da sola a oggi: e' il caso di gran lunga piu'
                    // frequente, e si scrive proprio il giorno che
                    // finisce.
                    completata_il:
                      stato === 'completata' ? (c.completata_il ?? oggi()) : c.completata_il,
                  }
                })
              }
            >
              {STATI_NOTA.map((s) => (
                <option key={s} value={s}>
                  {ETICHETTA_STATO[s]}
                </option>
              ))}
            </CampoSelect>

            <Campo
              etichetta="Iniziata il"
              type="date"
              value={campi.iniziata_il ?? ''}
              onChange={(e) => setCampi((c) => ({ ...c, iniziata_il: e.target.value || null }))}
            />

            <Campo
              etichetta="Completata il"
              type="date"
              disabled={campi.stato !== 'completata'}
              value={campi.completata_il ?? ''}
              onChange={(e) => setCampi((c) => ({ ...c, completata_il: e.target.value || null }))}
            />
          </div>

          <CampoArea
            etichetta="Note"
            rows={3}
            placeholder="Cosa è rimasto indietro, cosa ha rallentato, cosa serve."
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
        </div>
      )}

      {elimina.isError && (
        <div className="px-5 py-3">
          <Avviso tono="errore">Non riesco a togliere la nota: {(elimina.error as Error).message}</Avviso>
        </div>
      )}

      {isPending ? (
        <p className="px-5 py-4 text-sm font-bold text-gray-600">Carico le note…</p>
      ) : !note || note.length === 0 ? (
        <div className="p-5">
          <Vuoto>
            Nessuna nota su questo cantiere. Servono a dire a che punto sono le lavorazioni:
            quando una finisce e quale comincia.
          </Vuoto>
        </div>
      ) : (
        <ul className="divide-y-2 divide-black">
          {note.map((n) => (
            <li
              key={n.id}
              className={cn('px-5 py-3', n.stato === 'completata' ? 'bg-white' : 'bg-amber-50/40')}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-black">{n.lavorazione}</p>
                  <p className="text-xs font-semibold text-gray-600">{quando(n)}</p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Badge colore={COLORE[n.stato]} className="px-2 py-0.5 text-[10px]">
                    {ETICHETTA_STATO[n.stato]}
                  </Badge>
                  {puoScrivere && (
                    <>
                      <Button dimensione="sm" onClick={() => apriCorrezione(n)}>
                        Correggi
                      </Button>
                      <Button
                        dimensione="sm"
                        variante="danger"
                        disabled={elimina.isPending}
                        onClick={() => {
                          if (!confirm(`Togliere la nota «${n.lavorazione}»?`)) return
                          elimina.mutate({ id: n.id, cantiereId })
                        }}
                      >
                        ×
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {n.note && (
                <p className="mt-2 whitespace-pre-wrap text-sm font-semibold text-gray-800">
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

/** Le date in una riga sola, e solo quelle che ci sono: «dal 02/09 —
 *  finita il 10/09», oppure «dal 02/09», oppure niente. */
function quando(n: NotaContabile): string {
  const pezzi: string[] = []
  if (n.iniziata_il) pezzi.push(`dal ${fmtData(n.iniziata_il)}`)
  if (n.completata_il) pezzi.push(`finita il ${fmtData(n.completata_il)}`)
  return pezzi.join(' · ') || 'senza date'
}
