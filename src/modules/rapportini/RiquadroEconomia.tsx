import { useState } from 'react'
import { Avviso, Button, Campo, CampoArea, Card, Input, Vuoto } from '../../ui'
import { numero as fmtNumero } from '../../lib/formato'
import {
  useEliminaNota,
  useNoteContabili,
  useSalvaNota,
  type NotaContabile,
} from '../cantieri/noteContabili'

/* ══════════════════════════════════════════════════════════════════
   Le ore in economia, mentre si compila il rapportino.

   Nascono qui e non altrove: sono note della GIORNATA, e chi le scrive
   se le ricorda il giorno stesso. Il mese dopo il nido d'api non se lo
   ricorda piu' nessuno e quelle due ore restano a carico dell'impresa.

   DA NON CONFONDERE CON LA DESCRIZIONE ATTIVITA', ed e' il motivo per
   cui questo riquadro sta lontano da quella e ha un colore suo:

     descrizione attivita'   il lavoro previsto dal progetto, che si
                             paga a misura sulle quantita'
     ore in economia         cio' che il progetto NON prevedeva, che si
                             paga sulle ore e si fattura a parte

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
  ore: number
  note: string | null
}

const VUOTA: DatiEconomia = { descrizione: '', ore: 0, note: null }

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
  const totale =
    diOggi.reduce((t, n) => t + Number(n.ore), 0) +
    inAttesa.reduce((t, n) => t + Number(n.ore), 0)

  function conferma() {
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

    const pulita: DatiEconomia = {
      descrizione: campi.descrizione.trim(),
      ore: campi.ore,
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
          <h2 className="text-lg font-extrabold text-black">Ore in economia</h2>
          {/* Questa frase e' il pezzo piu' importante del riquadro: senza,
              qualcuno ci scrive dentro il lavoro della giornata. */}
          <p className="text-xs font-semibold text-gray-600">
            Lavorazioni <strong>non previste dal progetto</strong>, che si fatturano a parte:
            l&rsquo;imprevisto che ha rubato tempo. Il lavoro previsto va nella descrizione
            attività, non qui.
          </p>
        </div>
        {totale > 0 && (
          <p className="shrink-0 text-xs font-extrabold text-black">
            {fmtNumero(totale)} ore
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
              ore={Number(n.ore)}
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
              ore={n.ore}
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
          <Campo
            etichetta="Cosa è stato fatto"
            placeholder="Rimozione nido d’api prima di alzare il muro"
            value={campi.descrizione}
            onChange={(e) => setCampi((c) => ({ ...c, descrizione: e.target.value }))}
          />

          <label className="grid gap-1.5">
            <span className="text-xs font-bold uppercase">Ore</span>
            <Input
              type="number"
              min={0}
              max={24}
              step={0.5}
              inputMode="decimal"
              className="numerico w-28 px-3 py-2 text-center"
              value={campi.ore}
              onChange={(e) => setCampi((c) => ({ ...c, ore: Number(e.target.value) }))}
            />
          </label>

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
            Queste ore non si sommano a quelle della squadra qui sopra: sono le stesse ore,
            segnate qui perché si fatturano a parte.
          </p>
        </div>
      )}
    </Card>
  )
}

function Riga({
  descrizione,
  ore,
  note,
  inAttesa = false,
  onTogli,
}: {
  descrizione: string
  ore: number
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
          <p className="text-sm font-bold text-black">{descrizione}</p>
          {note && <p className="text-xs font-semibold text-gray-600">{note}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="numerico text-sm font-extrabold text-black">{fmtNumero(ore)} h</span>
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
