import { useState } from 'react'
import { Avviso, Badge, Button, Campo, Card, Input, Percorso, Select, Table, Vuoto, cn } from '../../ui'
import { useMioDipendente } from '../anagrafiche/dipendenti'
import { ASSENZE, oggi } from '../rapportini/campiRapportino'
import { data as fmtData, giornoPiu } from '../../lib/formato'
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

  const [giorno, setGiorno] = useState(oggi())
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
        <Percorso indietro={{ etichetta: 'Home', a: '/' }} qui={[{ etichetta: 'Le mie ore' }]} />
        <Avviso tono="info">
          La tua scheda personale non è collegata a questa utenza, quindi non c&rsquo;è nessun
          posto dove scrivere le tue ore. Chiedi all&rsquo;amministrazione di collegarla:
          Operai → la tua scheda → «Utente del gestionale».
        </Avviso>
      </div>
    )
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-4">
      <Percorso indietro={{ etichetta: 'Home', a: '/' }} qui={[{ etichetta: 'Le mie ore' }]} />

      <div>
        <h1 className="text-2xl font-extrabold text-black">Le mie ore</h1>
        <p className="text-sm font-semibold text-gray-600">
          Le tue ore della giornata, senza cantiere. Il lavoro dei cantieri si racconta nei
          rapportini.
        </p>
      </div>

      <FormGiornata
        key={giorno}
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
  giorno,
  onCambiaGiorno,
  giornata,
  carico,
  dipendenteId,
  salva,
  transizione,
  elimina,
}: {
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
  const [ordinarie, setOrdinarie] = useState(String(giornata?.ore_ordinarie ?? 8))
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

          {futuro && (
            <Avviso tono="info">
              È un giorno che deve ancora arrivare: le ore si dichiarano dopo averle fatte.
            </Avviso>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <Campo etichetta="Ore ordinarie">
              <Input
                type="number"
                step="0.5"
                min="0"
                max="24"
                value={ordinarie}
                disabled={!apribile || futuro}
                onChange={(e) => setOrdinarie(e.target.value)}
              />
            </Campo>
            <Campo etichetta="Straordinarie">
              <Input
                type="number"
                step="0.5"
                min="0"
                max="24"
                value={straordinarie}
                disabled={!apribile || futuro}
                onChange={(e) => setStraordinarie(e.target.value)}
              />
            </Campo>
            <Campo etichetta="Ore di assenza">
              <Input
                type="number"
                step="0.5"
                min="0"
                max="24"
                value={assenza}
                disabled={!apribile || futuro}
                onChange={(e) => setAssenza(e.target.value)}
              />
            </Campo>
          </div>

          {/* Il motivo compare solo quando serve: una tendina sempre
              accesa su una giornata normale e' una domanda a cui non
              c'e' niente da rispondere. */}
          {num(assenza) > 0 && (
            <Campo etichetta="Perché eri assente">
              <Select
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
              </Select>
            </Campo>
          )}

          <Campo
            etichetta="Cosa hai fatto"
            suggerimento="Il giro dei cantieri, l'ufficio, un sopralluogo. Senza un cantiere a dirlo, è questo che lo racconta."
          >
            <textarea
              value={descrizione}
              disabled={!apribile || futuro}
              onChange={(e) => setDescrizione(e.target.value)}
              placeholder="Giro dei tre cantieri, poi ufficio per il preventivo Giarrizzo"
              className="min-h-20 w-full rounded-xl border-2 border-black bg-white px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:bg-gray-100"
            />
          </Campo>

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
