import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Avviso, Badge, Button, Campo, CampoArea, CampoSelect, Card, Percorso, Table, Vuoto, cn } from '../../ui'
import { oreContratto, useMioDipendente, useOrari } from '../anagrafiche/dipendenti'
import { ASSENZE, oggi, versoHome } from '../rapportini/campiRapportino'
import { data as fmtData, giornoPiu } from '../../lib/formato'
import { eFineSettimana, nomeNonFeriale } from '../../lib/giorni'
import {
  modificabile,
  totaleOre,
  useEliminaGiornata,
  useGiornataPersonale,
  useOrePersonali,
  useSalvaGiornata,
  useTransizioneOre,
  type StatoOre,
} from './orePersonali'

/* ══════════════════════════════════════════════════════════════════
   «Le mie ore» — il foglio di chi non le presta a un cantiere solo.

   La pagina risponde a una domanda al giorno: quante ore ho fatto
   oggi, e cosa ho fatto. Niente cantiere, perche' chi la usa i cantieri
   li segue tutti.

   UNA GIORNATA PER VOLTA, non una tabella da riempire. Il gesto vero e'
   serale e riguarda oggi: aprire su un elenco di trenta righe
   modificabili vorrebbe dire cercare la propria riga ogni sera. Lo
   storico sta sotto, in sola lettura, che e' il suo ruolo — ci si
   guarda, non ci si lavora.
   ══════════════════════════════════════════════════════════════════ */

export function MieOrePage() {
  const { data: mio, isPending: caricoMio } = useMioDipendente()
  const { data: orari } = useOrari()

  /* La giornata puo' arrivare dall'indirizzo, e deve.
  
     In home il giorno di lavoro NON e' necessariamente oggi: la home si
     apre su ieri se ieri e' rimasto incompleto, e le frecce permettono
     di tornare piu' indietro. Chi da li' preme «Compila le tue ore»
     vuole quella giornata. Partendo da `oggi()` si sarebbe ritrovato a
     scrivere le ore sul giorno sbagliato senza che niente glielo
     dicesse — e le ore finite sul giorno sbagliato si scoprono in busta
     paga.
  
     Un valore fuori formato viene ignorato invece di essere creduto:
     l'indirizzo lo puo' scrivere chiunque. */
  const [params] = useSearchParams()
  const daIndirizzo = params.get('data')
  const iniziale =
    daIndirizzo && /^\d{4}-\d{2}-\d{2}$/.test(daIndirizzo) && daIndirizzo <= oggi()
      ? daIndirizzo
      : oggi()

  const [giorno, setGiorno] = useState(iniziale)
  const { data: giornata, isPending } = useGiornataPersonale(giorno)
  const { data: storico } = useOrePersonali()

  const salva = useSalvaGiornata()
  const transizione = useTransizioneOre()
  const elimina = useEliminaGiornata()

  if (caricoMio) {
    return <p className="text-sm font-bold text-gray-600">Carico…</p>
  }

  /* Senza scheda collegata non c'e' NIENTE da fare qui, e il messaggio
     lo dice con la via d'uscita: il collegamento lo fa
     l'amministrazione, non chi legge. Un «non autorizzato» generico
     lascerebbe a indovinare chi bisogna chiamare. */
  if (!mio) {
    return (
      <div className="mx-auto grid max-w-3xl gap-4">
        <Percorso indietro={{ etichetta: 'Home', a: versoHome(giorno) }} qui={[{ etichetta: 'Le mie ore' }]} />
        <Avviso tono="info">
          La tua scheda personale non è collegata a questa utenza, quindi non c&rsquo;è nessun
          posto dove scrivere le tue ore. Chiedi all&rsquo;amministrazione di collegarla:
          Operai → la tua scheda → «Utente del gestionale».
        </Avviso>
      </div>
    )
  }

  // La giornata piena del suo contratto: 8, o meno se e' part-time.
  const piena = oreContratto(orari, mio.id, giorno)

  return (
    <div className="mx-auto grid max-w-4xl gap-4">
      <Percorso indietro={{ etichetta: 'Home', a: versoHome(giorno) }} qui={[{ etichetta: 'Le mie ore' }]} />

      <div>
        <h1 className="text-2xl font-extrabold text-black">Le mie ore</h1>
        <p className="text-sm font-semibold text-gray-600">
          Le tue ore della giornata, senza cantiere. Il lavoro dei cantieri si racconta nei
          rapportini.
        </p>
      </div>

      {/* La chiave comprende la giornata piena: se l'orario arriva dopo
          il primo disegno, il modulo riparte con quella giusta invece di
          restare sull'8 di partenza. */}
      <FormGiornata
        key={`${giorno}-${piena}`}
        piena={piena}
        giorno={giorno}
        onCambiaGiorno={setGiorno}
        giornata={giornata ?? null}
        carico={isPending}
        dipendenteId={mio.id}
        salva={salva}
        transizione={transizione}
        elimina={elimina}
      />

      <Storico righe={storico ?? []} suGiorno={setGiorno} />
    </div>
  )
}

/* ── il form di una giornata ────────────────────────────────────── */

function FormGiornata({
  piena,
  giorno,
  onCambiaGiorno,
  giornata,
  carico,
  dipendenteId,
  salva,
  transizione,
  elimina,
}: {
  /** Le ore di una giornata piena per chi scrive: 8, o meno se part-time. */
  piena: number
  giorno: string
  onCambiaGiorno: (g: string) => void
  giornata: ReturnType<typeof useGiornataPersonale>['data']
  carico: boolean
  dipendenteId: string
  salva: ReturnType<typeof useSalvaGiornata>
  transizione: ReturnType<typeof useTransizioneOre>
  elimina: ReturnType<typeof useEliminaGiornata>
}) {
  /* Lo stato parte dai dati ma poi vive per conto suo: `key={giorno}`
     nel genitore rimonta il form quando cambia la data, che e' il modo
     di React per dire «questa e' un'altra giornata» senza un effetto
     che sincronizzi. */
  /* ── OTTO ORE SOLO NEI GIORNI IN CUI SI LAVORA ──────────────────

     Il modulo si apriva precompilato a 8 ore su QUALUNQUE giorno,
     sabato e domenica compresi, e non diceva niente di diverso. Il
     22 settembre l'utente ha trovato due giornate da 8 ore in bozza
     sul 19 e sul 20, create a due secondi di distanza scorrendo le
     frecce della data: il modulo le proponeva, bastava premere Salva.

     Quelle due righe poi accendevano il rosso nel calendario del
     titolare — «cosa c'entrano i sabati e le domeniche in rosso? Sono
     giornate festive e nessuno ha lavorato».

     Nel fine settimana si parte da ZERO. Chi ha lavorato davvero
     scrive le sue ore e salva come sempre — nessun blocco, perche' un
     sabato di lavoro esiste e vietarlo costringerebbe a spostarlo su
     un altro giorno, cioe' a falsificare le paghe. Ma il programma non
     lo propone piu': il valore di partenza e' un suggerimento, e
     suggerire otto ore di lavoro su una domenica e' un suggerimento
     sbagliato.

     ⚠️ Vale solo per una giornata NUOVA. Se la riga esiste gia' — e
     quindi qualcuno ha davvero scritto quelle ore — si legge il suo
     valore e non si azzera niente. */
  const festivo = eFineSettimana(giorno)
  const [ordinarie, setOrdinarie] = useState(
    String(giornata?.ore_ordinarie ?? (festivo ? 0 : piena)),
  )
  const [straordinarie, setStraordinarie] = useState(String(giornata?.ore_straordinarie ?? 0))
  const [assenza, setAssenza] = useState(String(giornata?.ore_assenza ?? 0))
  const [tipoAssenza, setTipoAssenza] = useState(giornata?.tipo_assenza ?? '')
  const [descrizione, setDescrizione] = useState(giornata?.descrizione ?? '')
  const [problema, setProblema] = useState<string | null>(null)

  const stato: StatoOre = giornata?.stato ?? 'bozza'
  const apribile = modificabile(stato)
  const futuro = giorno > oggi()

  const num = (s: string) => (s.trim() === '' ? 0 : Number(s.replace(',', '.')))
  const totale = num(ordinarie) + num(straordinarie) + num(assenza)

  function conferma() {
    setProblema(null)

    if (totale === 0) {
      setProblema('Una giornata da zero ore non dice niente: scrivi le ore, o segna il motivo se non c’eri.')
      return
    }
    if (totale > 24) {
      setProblema(`${totale} ore in un giorno solo: controlla i numeri.`)
      return
    }
    if (num(assenza) > 0 && tipoAssenza === '') {
      setProblema('Hai segnato delle ore di assenza: dì anche perché.')
      return
    }

    salva.mutate({
      dipendenteId,
      dati: {
        data: giorno,
        ore_ordinarie: num(ordinarie),
        ore_straordinarie: num(straordinarie),
        ore_assenza: num(assenza),
        tipo_assenza: num(assenza) > 0 ? tipoAssenza : null,
        descrizione: descrizione.trim() || null,
      },
    })
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black bg-emerald-100 px-5 py-3">
        <div className="flex items-center gap-2">
          {/* Le frecce ai lati della data, come in home: il posto per
              cambiare la data e' quello dove la si legge. Mai nel
              futuro — le ore si dichiarano dopo averle fatte. */}
          <Button
            dimensione="sm"
            onClick={() => onCambiaGiorno(giornoPiu(giorno, -1))}
            aria-label="Giorno precedente"
          >
            ‹
          </Button>
          <div className="text-center">
            <p className="text-sm font-extrabold capitalize text-black">{fmtData(giorno)}</p>
          </div>
          <Button
            dimensione="sm"
            disabled={giorno >= oggi()}
            onClick={() => onCambiaGiorno(giornoPiu(giorno, 1))}
            aria-label="Giorno successivo"
          >
            ›
          </Button>
        </div>

        <StatoOreBadge stato={stato} esiste={Boolean(giornata)} />
      </div>

      {carico ? (
        <p className="px-5 py-4 text-sm font-bold text-gray-600">Carico la giornata…</p>
      ) : (
        <div className="grid gap-4 p-5">
          {stato === 'respinto' && giornata?.motivo_rifiuto && (
            <Avviso tono="errore">
              <strong>Respinta:</strong> {giornata.motivo_rifiuto}
            </Avviso>
          )}

          {/* IL FESTIVO SI DICE, non si vieta. Chi apre un sabato quasi
              sempre ci e' arrivato scorrendo le frecce, e senza una
              riga che lo avverta il modulo sembra un giorno come gli
              altri — che e' come sono nate le due giornate di prova
              del 19 e del 20.

              Non compare se la giornata esiste gia': a quel punto
              qualcuno HA lavorato quel sabato, e ricordargli che e'
              festivo sarebbe una lezione, non un aiuto. */}
          {festivo && !futuro && !giornata && (
            <Avviso tono="info">
              È {nomeNonFeriale(giorno)}: di norma non si lavora, e infatti le ore partono
              da zero. Se hai lavorato davvero, scrivile pure e invia come sempre.
            </Avviso>
          )}

          {futuro && (
            <Avviso tono="info">
              È un giorno che deve ancora arrivare: le ore si dichiarano dopo averle fatte.
            </Avviso>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <Campo
              etichetta="Ore ordinarie"
              type="number"
              step="0.5"
              min="0"
              max="24"
              value={ordinarie}
              disabled={!apribile || futuro}
              onChange={(e) => setOrdinarie(e.target.value)}
            />
            <Campo
              etichetta="Straordinarie"
              type="number"
              step="0.5"
              min="0"
              max="24"
              value={straordinarie}
              disabled={!apribile || futuro}
              onChange={(e) => setStraordinarie(e.target.value)}
            />
            <Campo
              etichetta="Ore di assenza"
              type="number"
              step="0.5"
              min="0"
              max="24"
              value={assenza}
              disabled={!apribile || futuro}
              onChange={(e) => setAssenza(e.target.value)}
            />
          </div>

          {/* Il motivo compare solo quando serve: una tendina sempre
              accesa su una giornata normale e' una domanda a cui non
              c'e' niente da rispondere. */}
          {num(assenza) > 0 && (
            <CampoSelect
              etichetta="Perché eri assente"
              value={tipoAssenza}
              disabled={!apribile || futuro}
              onChange={(e) => setTipoAssenza(e.target.value)}
            >
              <option value="">Scegli…</option>
              {ASSENZE.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </CampoSelect>
          )}

          <CampoArea
            etichetta="Cosa hai fatto"
            suggerimento="Il giro dei cantieri, l'ufficio, un sopralluogo. Senza un cantiere a dirlo, è questo che lo racconta."
            value={descrizione}
            disabled={!apribile || futuro}
            onChange={(e) => setDescrizione(e.target.value)}
            placeholder="Giro dei tre cantieri, poi ufficio per il preventivo Giarrizzo"
          />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-black pt-4">
            <p className="text-sm font-extrabold">
              Totale giornata: <span className="text-lg">{totale}</span> ore
            </p>

            <div className="flex flex-wrap gap-2">
              {apribile && !futuro && (
                <Button
                  variante="primario"
                  disabled={salva.isPending}
                  onClick={conferma}
                >
                  {salva.isPending ? 'Salvo…' : 'Salva'}
                </Button>
              )}

              {/* L'invio c'e' solo se la giornata esiste gia': mandare
                  qualcosa che non e' stato salvato non vuol dire
                  niente. */}
              {giornata && apribile && (
                <Button
                  disabled={transizione.isPending}
                  onClick={() =>
                    transizione.mutate({
                      id: giornata.id,
                      stato: 'inviato',
                      inviato_at: new Date().toISOString(),
                    })
                  }
                >
                  Invia al titolare
                </Button>
              )}

              {giornata && apribile && (
                <Button
                  variante="danger"
                  disabled={elimina.isPending}
                  onClick={() => elimina.mutate(giornata.id)}
                >
                  Elimina
                </Button>
              )}
            </div>
          </div>

          {problema && <Avviso tono="errore">{problema}</Avviso>}
          {salva.isError && <Avviso tono="errore">{(salva.error as Error).message}</Avviso>}
          {transizione.isError && (
            <Avviso tono="errore">{(transizione.error as Error).message}</Avviso>
          )}
          {elimina.isError && <Avviso tono="errore">{(elimina.error as Error).message}</Avviso>}

          {!apribile && (
            <Avviso tono="info">
              Questa giornata è partita: da qui non si tocca più. Se c&rsquo;è un errore,
              chiedi al titolare di rimandartela indietro.
            </Avviso>
          )}
        </div>
      )}
    </Card>
  )
}

/* ── lo storico ─────────────────────────────────────────────────── */

function Storico({
  righe,
  suGiorno,
}: {
  righe: NonNullable<ReturnType<typeof useOrePersonali>['data']>
  suGiorno: (g: string) => void
}) {
  if (righe.length === 0) {
    return (
      <Card className="p-5">
        <Vuoto>
          Non hai ancora dichiarato nessuna giornata. La prima è quella qui sopra.
        </Vuoto>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b-2 border-black bg-white px-5 py-3">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-black">
          Le giornate di prima
        </h2>
      </div>
      <Table>
        <thead>
          <tr>
            <th>Giorno</th>
            <th className="text-right">Ore</th>
            <th>Cosa</th>
            <th>Stato</th>
          </tr>
        </thead>
        <tbody>
          {righe.map((r) => (
            <tr
              key={r.id}
              onClick={() => suGiorno(r.data)}
              className="neo-press cursor-pointer hover:bg-amber-50"
            >
              <td className="font-bold">{fmtData(r.data)}</td>
              <td className="text-right font-bold">{totaleOre(r)}</td>
              {/* La descrizione tagliata: in una riga di tabella serve a
                  riconoscere la giornata, non a rileggerla. */}
              <td className="max-w-xs truncate text-gray-600">{r.descrizione ?? '—'}</td>
              <td>
                <StatoOreBadge stato={r.stato as StatoOre} esiste />
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  )
}

/* ── il badge di stato ──────────────────────────────────────────── */

const TONO: Record<StatoOre, string> = {
  bozza: 'bg-white',
  inviato: 'bg-yellow-300',
  validato: 'bg-lime-300',
  respinto: 'bg-rose-300',
}

const ETICHETTA: Record<StatoOre, string> = {
  bozza: 'Da inviare',
  inviato: 'Dal titolare',
  validato: 'Validata',
  respinto: 'Respinta',
}

function StatoOreBadge({ stato, esiste }: { stato: StatoOre; esiste: boolean }) {
  // Una giornata che non esiste ancora non e' "in bozza": non e'
  // niente. Dirlo com'e' evita di far cercare una bozza che nessuno ha
  // scritto.
  if (!esiste) {
    return <Badge className="bg-gray-100">Non ancora compilata</Badge>
  }
  return <Badge className={cn(TONO[stato])}>{ETICHETTA[stato]}</Badge>
}
