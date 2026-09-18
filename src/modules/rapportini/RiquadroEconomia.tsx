import { useState } from 'react'
import { Avviso, Button, CampoArea, Card, Vuoto } from '../../ui'
import {
  useEliminaNota,
  useNoteContabili,
  useSalvaNota,
  type NotaContabile,
} from '../cantieri/noteContabili'

/* ══════════════════════════════════════════════════════════════════
   I lavori extra, mentre si compila il rapportino.

   Nascono qui e non altrove: sono note della GIORNATA, e chi le scrive
   se le ricorda il giorno stesso. Il mese dopo il nido d'api non se lo
   ricorda piu' nessuno, e quel lavoro resta a carico dell'impresa.

   DA NON CONFONDERE CON LA DESCRIZIONE ATTIVITA', ed e' il motivo per
   cui questo riquadro sta lontano da quella e ha un colore suo:

     descrizione attivita'   il lavoro previsto dal progetto, che si
                             paga a misura sulle quantita'
     lavori extra            cio' che il progetto NON prevedeva, che si
                             fattura a parte

   NIENTE ORE, deciso dall'utente il 2026-09-15: qui serve il racconto
   di cosa e' stato fatto — misure, calcoli, lavori a corpo — e la
   contabilita' di quei lavori la fa lui fuori dal gestionale. Il campo
   e' largo perche' e' l'unica cosa che conta.

   Il riquadro si comporta in due modi, come quello delle foto:

     scheda gia' salvata   la nota parte subito e compare fra le salvate
     scheda nuova          resta in attesa e la scrive chi salva

   La seconda strada esiste perche' su una scheda nuova il cantiere e il
   giorno si possono ancora cambiare: scrivere subito vorrebbe dire
   lasciare note appese al cantiere sbagliato.

   La nota NON ha una data sua: prende quella del rapportino. E' la
   giornata che si sta compilando, e un secondo campo data sarebbe solo
   un modo in piu' di sbagliare.
   ══════════════════════════════════════════════════════════════════ */

export type DatiEconomia = {
  descrizione: string
  note: string | null
}

const VUOTA: DatiEconomia = { descrizione: '', note: null }

type Props = {
  cantiereId: string
  giorno: string
  /** Vero solo su una scheda che esiste gia'. */
  subito: boolean
  /** Note scelte e non ancora scritte, per la scheda che non c'e'
   *  ancora. Le tiene il form, perche' e' lui a salvare. */
  inAttesa: DatiEconomia[]
  onCambia: (note: DatiEconomia[]) => void
  modificabile?: boolean
}

export function RiquadroEconomia({
  cantiereId,
  giorno,
  subito,
  inAttesa,
  onCambia,
  modificabile = true,
}: Props) {
  const { data: salvate, error } = useNoteContabili(subito ? cantiereId : undefined)
  const salva = useSalvaNota()
  const elimina = useEliminaNota()

  const [apri, setApri] = useState(false)
  const [campi, setCampi] = useState<DatiEconomia>(VUOTA)
  const [problema, setProblema] = useState<string | null>(null)

  // Solo la giornata che si sta compilando. Il resto della storia del
  // cantiere si guarda nella scheda del cantiere, non da qui dentro.
  const diOggi: NotaContabile[] = (salvate ?? []).filter((n) => n.data === giorno)
  // Quante lavorazioni, non quante ore: il conto che interessa e' «ce
  // n'e' qualcuna?», e la risposta e' un numero piccolo.
  const quante = diOggi.length + inAttesa.length

  function conferma() {
    if (campi.descrizione.trim() === '') {
      setProblema('Scrivi cosa è stato fatto e perché non era previsto.')
      return
    }

    const pulita: DatiEconomia = {
      descrizione: campi.descrizione.trim(),
      note: campi.note?.trim() || null,
    }

    if (!subito) {
      onCambia([...inAttesa, pulita])
      setCampi(VUOTA)
      setProblema(null)
      setApri(false)
      return
    }

    salva.mutate(
      { cantiereId, dati: { ...pulita, data: giorno } },
      {
        onSuccess: () => {
          setCampi(VUOTA)
          setProblema(null)
          setApri(false)
        },
      },
    )
  }

  return (
    <Card className="grid gap-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold text-black">Lavori extra</h2>
          {/* Questa frase e' il pezzo piu' importante del riquadro: senza,
              qualcuno ci scrive dentro il lavoro della giornata. */}
          <p className="text-xs font-semibold text-gray-600">
            Lavorazioni <strong>non previste dal progetto</strong>, che si fatturano a parte:
            l&rsquo;imprevisto che ha rubato tempo. Il lavoro previsto va nella descrizione
            attività, non qui.
          </p>
        </div>
        {quante > 0 && (
          <p className="shrink-0 text-xs font-extrabold text-black">
            {quante} {quante === 1 ? 'lavorazione' : 'lavorazioni'}
          </p>
        )}
      </div>

      {error && <Avviso tono="errore">Non riesco a leggere le note: {error.message}</Avviso>}
      {elimina.isError && (
        <Avviso tono="errore">Non riesco a togliere la nota: {(elimina.error as Error).message}</Avviso>
      )}

      {diOggi.length === 0 && inAttesa.length === 0 ? (
        <Vuoto>Niente fuori progetto in questa giornata.</Vuoto>
      ) : (
        <ul className="grid gap-2">
          {diOggi.map((n) => (
            <Riga
              key={n.id}
              descrizione={n.descrizione}
              note={n.note}
              onTogli={
                modificabile
                  ? () => elimina.mutate({ id: n.id, cantiereId })
                  : undefined
              }
            />
          ))}
          {inAttesa.map((n, i) => (
            <Riga
              key={`attesa-${i}`}
              descrizione={n.descrizione}
              note={n.note}
              inAttesa
              onTogli={() => onCambia(inAttesa.filter((_, j) => j !== i))}
            />
          ))}
        </ul>
      )}

      {modificabile && !apri && (
        <div>
          <Button dimensione="sm" onClick={() => setApri(true)}>
            + Segna una lavorazione fuori progetto
          </Button>
        </div>
      )}

      {modificabile && apri && (
        <div className="grid gap-3 rounded-xl border-2 border-black bg-amber-50 p-4">
          {/* Un'area e non una riga: qui ci vanno misure, calcoli e
              lavori a corpo, e un campo alto una riga dice a chi scrive
              di essere breve proprio dove serve il contrario. */}
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
            rows={2}
            placeholder="Chi c’era, cosa è servito, cosa ha detto il cliente."
            value={campi.note ?? ''}
            onChange={(e) => setCampi((c) => ({ ...c, note: e.target.value }))}
          />

          {problema && <Avviso tono="errore">{problema}</Avviso>}
          {salva.isError && <Avviso tono="errore">{(salva.error as Error).message}</Avviso>}

          <div className="flex flex-wrap gap-2">
            {/* type="button" e' gia' il default dei nostri Button, e qui
                conta: siamo dentro un <form>, e un submit involontario
                salverebbe il rapportino mentre si scrive una nota. */}
            <Button
              variante="primario"
              dimensione="sm"
              disabled={salva.isPending}
              onClick={conferma}
            >
              {salva.isPending ? 'Salvo…' : 'Aggiungi'}
            </Button>
            <Button
              dimensione="sm"
              onClick={() => {
                setApri(false)
                setProblema(null)
              }}
            >
              Annulla
            </Button>
          </div>

          <p className="text-[11px] font-semibold text-gray-600">
            Qui non si segnano ore: le ore della giornata sono quelle della squadra qui
            sopra. Questo è il racconto del lavoro fuori progetto, per poterlo fatturare.
          </p>
        </div>
      )}
    </Card>
  )
}

function Riga({
  descrizione,
  note,
  inAttesa = false,
  onTogli,
}: {
  descrizione: string
  note: string | null
  inAttesa?: boolean
  onTogli?: () => void
}) {
  return (
    <li
      className={
        inAttesa
          ? 'rounded-xl border-2 border-dashed border-black bg-amber-50 p-3'
          : 'rounded-xl border-2 border-black bg-white p-3'
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {/* `whitespace-pre-wrap`: il testo ora puo' avere piu' righe —
              misure e calcoli vanno a capo, e schiacciarli in una riga
              sola butterebbe via il motivo per cui il campo e' largo. */}
          <p className="whitespace-pre-wrap text-sm font-bold text-black">{descrizione}</p>
          {note && <p className="text-xs font-semibold text-gray-600">{note}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onTogli && (
            <button
              type="button"
              onClick={onTogli}
              aria-label={`Togli «${descrizione}»`}
              title="Togli questa nota"
              className="neo-press h-7 w-7 cursor-pointer rounded-lg border-2 border-black bg-white text-sm font-extrabold leading-none hover:bg-rose-200"
            >
              ×
            </button>
          )}
        </div>
      </div>
    </li>
  )
}
