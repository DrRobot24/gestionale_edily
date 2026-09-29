import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { Avviso, Badge, Button, Campo, CampoSelect, Card, cn } from '../../ui'
import { data as fmtData } from '../../lib/formato'
import {
  NOME_CASSETTO,
  giorniA,
  statoScadenza,
  useCaricaDocumento,
  useDocumentiPersonali,
  useEliminaDocumento,
  useModificaDocumento,
  type Cassetto,
  type DocumentoPersonale,
} from './documentiPersonali'

/* ══════════════════════════════════════════════════════════════════
   I documenti della persona, IN CASSETTI SEPARATI.

   Chiesti dall'utente il 2026-09-18. Il file sale nel bucket
   `personale`, che e' chiuso: gli indirizzi si firmano a ogni lettura e
   scadono dopo un'ora, perche' dentro ci sono carte d'identita' e
   permessi di soggiorno.

   I CASSETTI, dal 2026-09-29: «non confondiamo i cassetti! Tu
   metteresti mutande e calzini insieme con le camicie e i maglioni?»
   (utente). Identita' e permesso di soggiorno stanno in anagrafica, nel
   riquadro «Chi e'»; attestati, patentini, formazione e corsi qui, fra
   i documenti di lavoro. Lo stesso componente per tutti e tre: cambia
   il cassetto che legge e scrive. Un documento finito nel cassetto
   sbagliato si sposta con «modifica».

   E ogni documento si CORREGGE dopo averlo caricato — nome, scadenza,
   cassetto, e il file stesso — invece di cancellarlo e rifarlo.

   LE SCADENZE SI VEDONO PRIMA: un attestato scaduto e' un operaio che
   non puo' salire sul ponteggio, e scoprirlo il giorno del controllo e'
   tardi. Scaduto in rosso, in scadenza entro trenta giorni in ambra.

   Esiste solo su una scheda GIA' SALVATA: un documento ha bisogno di
   una persona a cui appartenere.
   ══════════════════════════════════════════════════════════════════ */

/** Cosa si scrive di solito in ogni cassetto: suggerimenti, non un
 *  elenco chiuso. */
const SUGGERIMENTI: Record<Cassetto, string[]> = {
  identita: ['Carta d’identità', 'Passaporto', 'Tessera sanitaria', 'Codice fiscale'],
  permesso: ['Permesso di soggiorno', 'Ricevuta di rinnovo'],
  lavoro: [
    'Attestato formazione sicurezza',
    'Attestato ponteggi',
    'Patentino muletto',
    'Patentino PLE',
    'Corso primo soccorso',
    'Corso antincendio',
    'Idoneità sanitaria',
  ],
}

const ESEMPIO: Record<Cassetto, string> = {
  identita: 'Carta d’identità, passaporto…',
  permesso: 'Permesso di soggiorno',
  lavoro: 'Attestato ponteggi, corso sicurezza…',
}

const VUOTO: Record<Cassetto, string> = {
  identita: 'Nessun documento di identità caricato.',
  permesso: 'Nessuna copia del permesso caricata.',
  lavoro:
    'Nessun documento di lavoro. Qui vanno attestati, patentini, formazione e corsi: restano legati a questa persona.',
}

/* La scheda della persona e' un <form>, e i cassetti di identita' e
   permesso ci stanno dentro: un Invio in uno dei loro campi salverebbe
   la scheda invece del documento. */
function fermaInvio(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault()
}

const stileFile =
  'w-full rounded-xl border-2 border-black bg-white px-3 py-2 text-sm font-semibold file:mr-3 file:cursor-pointer file:rounded-lg file:border-2 file:border-black file:bg-amber-200 file:px-3 file:py-1 file:text-sm file:font-bold'

/** Lo stesso limite del bucket, detto prima: un rifiuto dello storage
 *  arriva come errore tecnico dopo aver caricato per un minuto. */
function fileTroppoGrande(f: File | null) {
  return Boolean(f && f.size > 20 * 1024 * 1024)
}

/**
 * Un cassetto di documenti: l'elenco, il caricamento, la modifica.
 *
 * @param conScadenza  Falso per il permesso di soggiorno: la sua
 *   scadenza sta nella scheda, accanto alla spunta, e due date per la
 *   stessa cosa prima o poi direbbero cose diverse.
 * @param titolo  L'intestazione del cassetto; senza, la da' chi lo
 *   contiene.
 */
export function CassettoDocumenti({
  dipendenteId,
  puoScrivere,
  cassetto,
  conScadenza = true,
  titolo,
  nota,
}: {
  dipendenteId: string
  puoScrivere: boolean
  cassetto: Cassetto
  conScadenza?: boolean
  titolo?: string
  nota?: string
}) {
  const { data: documenti, isPending, error } = useDocumentiPersonali(dipendenteId)
  const elimina = useEliminaDocumento()
  const [carica, setCarica] = useState(false)
  const [inModifica, setInModifica] = useState<string | null>(null)
  const lista = useId()

  const righe = (documenti ?? []).filter((d) => d.categoria === cassetto)

  return (
    <div className="grid gap-3" onKeyDown={fermaInvio}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {titolo ? (
          <div>
            <span className="block text-sm font-extrabold text-black">{titolo}</span>
            {nota && <span className="block text-xs font-semibold text-gray-600">{nota}</span>}
          </div>
        ) : (
          <span />
        )}
        {puoScrivere && !carica && (
          <Button dimensione="sm" onClick={() => setCarica(true)}>
            + Carica
          </Button>
        )}
      </div>

      {error && <Avviso tono="errore">Non riesco a leggere i documenti: {error.message}</Avviso>}
      {elimina.isError && (
        <Avviso tono="errore">
          Non riesco a togliere il documento: {(elimina.error as Error).message}
        </Avviso>
      )}

      <datalist id={lista}>
        {SUGGERIMENTI[cassetto].map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      {carica && (
        <NuovoDocumento
          dipendenteId={dipendenteId}
          cassetto={cassetto}
          conScadenza={conScadenza}
          lista={lista}
          onChiudi={() => setCarica(false)}
        />
      )}

      {isPending ? (
        <p className="text-sm font-bold text-gray-600">Carico i documenti…</p>
      ) : righe.length === 0 ? (
        !carica && <p className="text-xs font-semibold text-gray-600">{VUOTO[cassetto]}</p>
      ) : (
        <ul className="grid gap-2">
          {righe.map((d) =>
            inModifica === d.id ? (
              <li key={d.id}>
                <ModificaDocumento
                  documento={d}
                  dipendenteId={dipendenteId}
                  conScadenza={conScadenza}
                  lista={lista}
                  onChiudi={() => setInModifica(null)}
                />
              </li>
            ) : (
              <li
                key={d.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border-2 border-black/15 bg-white px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-black">{d.titolo}</p>
                  {conScadenza && d.scadenza && <Scadenza data={d.scadenza} />}
                  <p className="text-[11px] font-semibold text-gray-500">
                    caricato il {fmtData(d.created_at.slice(0, 10))}
                  </p>
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
                      <Button dimensione="sm" onClick={() => setInModifica(d.id)}>
                        Modifica
                      </Button>
                      <Button
                        dimensione="sm"
                        variante="danger"
                        aria-label={`Elimina ${d.titolo}`}
                        disabled={elimina.isPending}
                        onClick={() => {
                          if (!confirm(`Eliminare «${d.titolo}»?`)) return
                          elimina.mutate({ id: d.id, percorso: d.percorso, dipendenteId })
                        }}
                      >
                        ×
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  )
}

function Scadenza({ data }: { data: string }) {
  const stato = statoScadenza(data)
  return (
    <p className="mt-0.5 text-xs font-semibold text-gray-600">
      {stato === 'scaduto' ? (
        <Badge colore="errore">scaduto il {fmtData(data)}</Badge>
      ) : stato === 'in-scadenza' ? (
        <Badge colore="attesa">scade fra {giorniA(data)} giorni</Badge>
      ) : (
        <>scade il {fmtData(data)}</>
      )}
    </p>
  )
}

function NuovoDocumento({
  dipendenteId,
  cassetto,
  conScadenza,
  lista,
  onChiudi,
}: {
  dipendenteId: string
  cassetto: Cassetto
  conScadenza: boolean
  lista: string
  onChiudi: () => void
}) {
  const carica = useCaricaDocumento()
  // Il permesso ha un nome solo: lo si propone gia' scritto.
  const [titolo, setTitolo] = useState(cassetto === 'permesso' ? 'Permesso di soggiorno' : '')
  const [scadenza, setScadenza] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [problema, setProblema] = useState<string | null>(null)
  const campoFile = useRef<HTMLInputElement>(null)

  function conferma() {
    if (!file) return setProblema('Scegli il file da caricare.')
    if (titolo.trim() === '') return setProblema(`Dagli un nome: ${ESEMPIO[cassetto]}`)
    if (fileTroppoGrande(file))
      return setProblema('Il file supera i 20 MB: se è una scansione, riducila prima.')
    setProblema(null)
    carica.mutate(
      {
        dipendenteId,
        file,
        titolo: titolo.trim(),
        scadenza: conScadenza ? scadenza || null : null,
        categoria: cassetto,
      },
      { onSuccess: onChiudi },
    )
  }

  return (
    <div className="grid gap-3 rounded-xl border-2 border-black bg-amber-50 p-4">
      <label className="grid gap-1.5">
        <span className="text-xs font-bold uppercase">File</span>
        <input
          ref={campoFile}
          type="file"
          accept=".pdf,image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className={stileFile}
        />
        <span className="text-xs font-semibold text-gray-600">PDF o immagine, fino a 20 MB.</span>
      </label>

      <div className={cn('grid gap-3', conScadenza && 'sm:grid-cols-[minmax(0,1fr)_12rem]')}>
        <Campo
          etichetta="Come si chiama"
          list={lista}
          placeholder={ESEMPIO[cassetto]}
          suggerimento="Il nome con cui lo cercherai fra un anno, non quello del file."
          value={titolo}
          onChange={(e) => setTitolo(e.target.value)}
        />
        {/* Facoltativa perche' non tutto scade: una carta d'identita'
            si', un attestato di qualifica no. */}
        {conScadenza && (
          <Campo
            etichetta="Scade il"
            type="date"
            suggerimento="Vuota se non scade."
            value={scadenza}
            onChange={(e) => setScadenza(e.target.value)}
          />
        )}
      </div>

      {problema && <Avviso tono="errore">{problema}</Avviso>}
      {carica.isError && <Avviso tono="errore">{(carica.error as Error).message}</Avviso>}

      <div className="flex flex-wrap gap-2">
        <Button variante="primario" dimensione="sm" disabled={carica.isPending} onClick={conferma}>
          {carica.isPending ? 'Carico…' : 'Carica'}
        </Button>
        <Button dimensione="sm" onClick={onChiudi} disabled={carica.isPending}>
          Annulla
        </Button>
      </div>
    </div>
  )
}

/** Correggere un documento gia' caricato: nome, scadenza, cassetto, e
 *  volendo il file. Il file vecchio se ne va solo a sostituzione
 *  riuscita. */
function ModificaDocumento({
  documento: d,
  dipendenteId,
  conScadenza,
  lista,
  onChiudi,
}: {
  documento: DocumentoPersonale
  dipendenteId: string
  conScadenza: boolean
  lista: string
  onChiudi: () => void
}) {
  const modifica = useModificaDocumento()
  const [titolo, setTitolo] = useState(d.titolo)
  const [scadenza, setScadenza] = useState(d.scadenza ?? '')
  const [categoria, setCategoria] = useState<Cassetto>(d.categoria)
  const [file, setFile] = useState<File | null>(null)
  const [problema, setProblema] = useState<string | null>(null)

  function conferma() {
    if (titolo.trim() === '') return setProblema('Il documento ha bisogno di un nome.')
    if (fileTroppoGrande(file))
      return setProblema('Il file supera i 20 MB: se è una scansione, riducila prima.')
    setProblema(null)
    modifica.mutate(
      {
        id: d.id,
        dipendenteId,
        percorsoVecchio: d.percorso,
        titolo: titolo.trim(),
        /* Spostato nel cassetto del permesso, la scadenza non si vede
           piu' (sta sulla scheda): si toglie, se no resterebbe una data
           invisibile a far scattare il promemoria in home. */
        scadenza: categoria === 'permesso' ? null : scadenza || null,
        categoria,
        file,
      },
      { onSuccess: onChiudi },
    )
  }

  return (
    <div className="grid gap-3 rounded-xl border-2 border-black bg-amber-50 p-4">
      <div className={cn('grid gap-3', conScadenza && 'sm:grid-cols-[minmax(0,1fr)_12rem]')}>
        <Campo
          etichetta="Come si chiama"
          list={lista}
          value={titolo}
          onChange={(e) => setTitolo(e.target.value)}
        />
        {conScadenza && (
          <Campo
            etichetta="Scade il"
            type="date"
            suggerimento="Vuota se non scade."
            value={scadenza}
            onChange={(e) => setScadenza(e.target.value)}
          />
        )}
      </div>

      {/* Il cassetto giusto, per quello finito nel posto sbagliato —
          fra cui tutti quelli caricati prima del 2026-09-29, quando il
          cassetto era uno solo. */}
      <CampoSelect
        etichetta="Cassetto"
        className="sm:w-72"
        value={categoria}
        onChange={(e) => setCategoria(e.target.value as Cassetto)}
      >
        {(Object.keys(NOME_CASSETTO) as Cassetto[]).map((c) => (
          <option key={c} value={c}>
            {NOME_CASSETTO[c]}
          </option>
        ))}
      </CampoSelect>

      <label className="grid gap-1.5">
        <span className="text-xs font-bold uppercase">Sostituisci il file</span>
        <input
          type="file"
          accept=".pdf,image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className={stileFile}
        />
        <span className="text-xs font-semibold text-gray-600">
          Facoltativo: senza, resta il file di prima.
        </span>
      </label>

      {problema && <Avviso tono="errore">{problema}</Avviso>}
      {modifica.isError && <Avviso tono="errore">{(modifica.error as Error).message}</Avviso>}

      <div className="flex flex-wrap gap-2">
        <Button variante="primario" dimensione="sm" disabled={modifica.isPending} onClick={conferma}>
          {modifica.isPending ? 'Salvo…' : 'Salva'}
        </Button>
        <Button dimensione="sm" onClick={onChiudi} disabled={modifica.isPending}>
          Annulla
        </Button>
      </div>
    </div>
  )
}

// SI CHIAMA «...Persona» dal 2026-09-18, da quando esiste il riquadro
// generico in `modules/documenti/`. Due componenti con lo stesso nome in
// cartelle diverse sono una trappola: chi importa quello sbagliato non se
// ne accorge finche' non vede la scheda vuota.
/** Il riquadro dei DOCUMENTI DI LAVORO, sotto la scheda. Identita' e
 *  permesso stanno in «Chi e'»: vedi `CassettoDocumenti`. */
export function RiquadroDocumentiPersona({
  dipendenteId,
  puoScrivere,
}: {
  dipendenteId: string
  puoScrivere: boolean
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b-2 border-black bg-amber-100 px-5 py-2.5">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-black">
          Documenti di lavoro
        </h2>
        <p className="text-xs font-semibold text-gray-700">
          Attestati, patentini, formazione, corsi. Identità e permesso di soggiorno stanno in
          «Chi è».
        </p>
      </div>
      <div className="p-5">
        <CassettoDocumenti dipendenteId={dipendenteId} puoScrivere={puoScrivere} cassetto="lavoro" />
      </div>
    </Card>
  )
}
