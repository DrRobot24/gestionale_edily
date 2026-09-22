import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Avviso, Badge, Card, cn } from '../../ui'
import { eFineSettimana } from '../../lib/giorni'
import { dataEstesa, griglieDelMese, giornoPiu, meseEAnno, numero } from '../../lib/formato'
import { useCantieri } from '../cantieri/useCantieri'
import { oggi } from '../rapportini/campiRapportino'
import {
  useConsegneDelMese,
  useTecniciScollegati,
  type ConsegnaOre,
  type ConsegnaRapportino,
  type TecnicoInCampo,
} from './useConsegneDelMese'
import { ASPETTO_GIORNATA, statoGiornataTecnico, type StatoGiornata } from './statoGiornata'

/* ══════════════════════════════════════════════════════════════════
   COSA DEVO ANCORA RICEVERE DAL CAMPO.

   Il calendarietto del titolare, chiesto dall'utente il 2026-09-22:
   «voglio poter vedere un piccolo calendarietto cosi' come lo vede il
   tecnico, sempre con i colori semaforici, per capire cosa devo ancora
   ricevere dal mio tecnico in campo».

   UNO PER TECNICO, e non uno solo con tutti dentro. Scelta dell'utente
   fra le due: il titolare non chiede «manca qualcosa», chiede «chi non
   me l'ha mandato». Un calendario unico risponderebbe alla prima
   domanda e costringerebbe ad aprire il giorno per avere la seconda;
   cosi' il nome sta scritto sopra la griglia e la risposta si legge
   senza cliccare. Oggi Edily ha un tecnico solo; quando ne arrivera' un
   secondo il suo calendario si incolonna sotto, nella stessa striscia a
   sinistra.

   ── IL CONTEGGIO, e il suo limite dichiarato ────────────────────────

   Una giornata e' completa quando sono arrivati i rapportini di tutti i
   cantieri ATTIVI dell'impresa, piu' le ore che il tecnico dichiara per
   se'. E' la scelta dell'utente fra due, e va detto cosa comporta: se
   dei cinque cantieri attivi quel tecnico ne segue due, il suo conto
   sara' 3 di 5 e la giornata risultera' rossa anche quando ha
   consegnato tutto il suo.

   Per questo il denominatore E' SCRITTO IN PAGINA — «su 5 cantieri
   attivi» — invece di restare nascosto dentro la formula: un rosso di
   cui si vede la causa e' un'informazione, un rosso inspiegabile e' un
   allarme che si impara a ignorare. Se in ufficio si vedra' che il
   conto non torna mai, la regola da cambiare e' una funzione sola —
   `statoGiornataTecnico` — e il resto della pagina non si tocca.

   ── PERCHE' NON RIUSA IL CALENDARIO DEL TECNICO ─────────────────────

   Sembrano lo stesso oggetto e non lo sono. Quello del tecnico colora
   cio' che LUI deve compilare, legge da `useRapportini()` (200 righe su
   tutta l'impresa) e non guarda le ore personali di nessuno. Questo
   colora cio' che una PERSONA PRECISA ha consegnato, carica un mese per
   volta perche' il titolare sfoglia all'indietro, e le ore le guarda
   eccome. Il colore e' lo stesso, ed e' condiviso davvero: sta in
   `statoGiornata.ts`, che li serve entrambi.
   ══════════════════════════════════════════════════════════════════ */

const INIZIALI = ['L', 'M', 'M', 'G', 'V', 'S', 'D']

export function ConsegneDalCampo() {
  /* Il mese vive QUI e non dentro le griglie: con due tecnici
     affiancati, due mesi diversi sulla stessa riga sarebbero un
     confronto fra cose diverse presentato come un confronto. Si sfoglia
     una volta e si muovono insieme. */
  const [mese, setMese] = useState(oggi())
  const [giornoAperto, setGiornoAperto] = useState<string | null>(null)

  const { data, isPending, error } = useConsegneDelMese(mese)
  const { data: scollegati } = useTecniciScollegati()
  const { data: cantieri } = useCantieri()

  const attivi = (cantieri ?? []).filter((c) => c.stato === 'attivo').length

  if (error) {
    return (
      <Avviso tono="errore">Non riesco a leggere le consegne dal campo: {error.message}</Avviso>
    )
  }

  const tecnici = data?.tecnici ?? []
  const mancanti = scollegati ?? []

  /* Nessun tecnico in anagrafica: il riquadro sparisce del tutto invece
     di mostrare una cornice vuota. La home mostra cose da fare, e
     «non hai tecnici» non e' una cosa da fare — e' un'impresa che non
     ne ha, o un'anagrafica ancora da riempire, e in tutti e due i casi
     il posto per accorgersene sono i registri, non qui.

     L'avviso dei collegamenti mancanti invece resta anche da solo:
     quello si', e' una cosa da sistemare. */
  if (!isPending && tecnici.length === 0 && mancanti.length === 0) return null

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-black">Cosa aspetto dal campo</h2>
          <p className="text-xs font-semibold text-gray-600">
            Per ogni tecnico, giorno per giorno: i rapportini dei cantieri e le sue ore.
          </p>
        </div>

        <SfogliaMese mese={mese} onCambia={setMese} />
      </div>

      {/* Un tecnico senza utente collegato e' un buco che si vede solo
          da qui: in anagrafica la sua scheda sembra completa. Senza
          collegamento il programma non sa dire cosa ha scritto, e
          lasciarlo fuori in silenzio farebbe credere al titolare di
          avere il quadro intero quando gli manca una persona. */}
      {mancanti.length > 0 && (
        <Avviso tono="info">
          {mancanti.length === 1
            ? `${mancanti[0]} non ha un utente collegato: di questa persona non posso dire cosa ha consegnato.`
            : `Queste persone non hanno un utente collegato, e non posso dire cosa hanno consegnato: ${mancanti.join(', ')}.`}{' '}
          Si collega dalla scheda in Risorse.
        </Avviso>
      )}

      {isPending && <p className="text-sm font-bold text-gray-600">Carico le consegne…</p>}

      {/* IL DETTAGLIO STA DI FIANCO, non sotto.

          Sotto c'era, ed era sbagliato: un calendario e' largo quanto
          sette caselle e basta, quindi con un tecnico solo restava
          mezza schermata bianca a destra — e il dettaglio, che e' fatto
          di righe corte, andava a stendersi sotto a tutta pagina per
          contenerle. Due sprechi in una volta, lo spazio vuoto sopra e
          quello dentro le righe allargate. Segnalato dall'utente il
          2026-09-22 guardando la sua home.

          Le due colonne non sono uguali: il calendario chiede la sua
          larghezza naturale e non di piu', il dettaglio si prende il
          resto. `lg:w-[22rem] lg:shrink-0` sulla prima e `flex-1` sulla
          seconda fanno esattamente questo, mentre `lg:grid-cols-2`
          avrebbe diviso a meta' allargando le caselle per niente.

          `items-start` perche' il dettaglio non deve allungarsi fino in
          fondo al calendario quando ha tre righe: si ferma dov'e'
          finito.

          Sul telefono si impilano, calendario sopra e dettaglio sotto,
          che e' l'ordine del gesto: clicchi un giorno, leggi cosa c'e'
          dentro. */}
      {!isPending && tecnici.length > 0 && (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          {/* I calendari restano in colonna anche con piu' tecnici: due
              affiancati qui dentro rimangerebbero lo spazio al
              dettaglio, che e' proprio cio' che si stava correggendo.
              In verticale si confrontano lo stesso — stesso mese,
              stessa griglia, uno sotto l'altro. */}
          <div className="grid gap-4 lg:w-[22rem] lg:shrink-0">
            {tecnici.map((t) => (
              <CalendarioTecnico
                key={t.dipendenteId}
                tecnico={t}
                mese={mese}
                cantieriAttivi={attivi}
                rapportini={data!.rapportini}
                ore={data!.ore}
                giornoAperto={giornoAperto}
                onApriGiorno={(g) => setGiornoAperto((prec) => (prec === g ? null : g))}
              />
            ))}
          </div>

          <div className="lg:flex-1 lg:min-w-0">
            {giornoAperto ? (
              <DettaglioGiorno
                giorno={giornoAperto}
                tecnici={tecnici}
                cantieriAttivi={attivi}
                rapportini={data!.rapportini}
                ore={data!.ore}
                onChiudi={() => setGiornoAperto(null)}
              />
            ) : (
              /* L'invito compare SOLO da schermo largo (`hidden lg:`):
                 sul telefono le due colonne si impilano, e un
                 segnaposto grigio fra il calendario e il resto della
                 pagina sarebbe un ostacolo da scorrere. Da desktop
                 invece riempie il posto del dettaglio e dice cosa fare
                 per vederlo — senza, la colonna vuota sembra un pezzo
                 che non ha caricato. */
              <div className="hidden h-full min-h-64 place-content-center rounded-xl border-2 border-dashed border-black/25 bg-white/50 p-6 text-center lg:grid">
                <p className="text-sm font-bold text-gray-500">
                  Clicca una giornata per vedere cosa è arrivato e cosa manca.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── il calendario di una persona ───────────────────────────────── */

function CalendarioTecnico({
  tecnico,
  mese,
  cantieriAttivi,
  rapportini,
  ore,
  giornoAperto,
  onApriGiorno,
}: {
  tecnico: TecnicoInCampo
  mese: string
  cantieriAttivi: number
  rapportini: ConsegnaRapportino[]
  ore: ConsegnaOre[]
  giornoAperto: string | null
  onApriGiorno: (g: string) => void
}) {
  const suoi = raggruppaPerGiorno(rapportini, tecnico)
  const sueOre = oreDelTecnico(ore, tecnico)

  const celle = griglieDelMese(mese)
  const adesso = oggi()

  /* Quante giornate chiedono ancora qualcosa, nel mese mostrato. E' il
     numero che il titolare cerca davvero: il calendario dice QUALI, il
     conteggio dice QUANTE senza doverle cercare con l'occhio. */
  const daRicevere = celle.filter((c): c is string => {
    if (!c || c > adesso || eFineSettimana(c)) return false
    return statoGiornataTecnico(suoi.get(c) ?? [], cantieriAttivi, sueOre.get(c) ?? null) === 'rosso'
  }).length

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-black bg-white px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold uppercase tracking-wide text-black">
            {tecnico.nominativo}
          </p>
          {/* Il denominatore in chiaro: vedi il commento in testa al
              file. Chi legge deve poter capire da solo perche' una
              giornata e' rossa. */}
          <p className="text-xs font-semibold text-gray-600">
            su {cantieriAttivi} {cantieriAttivi === 1 ? 'cantiere attivo' : 'cantieri attivi'} · più
            le sue ore
          </p>
        </div>

        {/* Il badge compare SOLO quando c'e' qualcosa da ricevere: un
            «0 da ricevere» permanente e' una bacheca di cio' che e'
            gia' andato bene, che la home non deve essere. */}
        {daRicevere > 0 && (
          <Badge className="shrink-0 bg-rose-300 px-2.5 py-1 text-[11px]">
            {daRicevere} {daRicevere === 1 ? 'giornata' : 'giornate'} da ricevere
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-7 gap-1 p-3">
        {INIZIALI.map((i, k) => (
          <span
            key={`${i}-${k}`}
            className={cn(
              'pb-1 text-center text-[10px] font-extrabold uppercase',
              k >= 5 ? 'text-gray-400' : 'text-gray-500',
            )}
          >
            {i}
          </span>
        ))}

        {celle.map((cella, k) => {
          if (!cella) return <span key={`vuota-${k}`} />

          const stato = statoGiornataTecnico(
            suoi.get(cella) ?? [],
            cantieriAttivi,
            sueOre.get(cella) ?? null,
          )
          const futuro = cella > adesso
          const nonFeriale = eFineSettimana(cella)
          const scelto = cella === giornoAperto

          return (
            <button
              key={cella}
              type="button"
              disabled={futuro}
              onClick={() => onApriGiorno(cella)}
              aria-current={scelto ? 'date' : undefined}
              title={descrizione(stato)}
              className={cn(
                'relative aspect-square rounded-lg border-2 text-xs font-bold',
                stato === 'vuota'
                  ? nonFeriale
                    ? 'bg-gray-200 text-gray-500'
                    : 'bg-white'
                  : ASPETTO_GIORNATA[stato],
                scelto ? 'border-black ring-2 ring-black ring-offset-1' : 'border-black/30',
                futuro
                  ? 'cursor-not-allowed text-gray-300'
                  : 'neo-press cursor-pointer text-black hover:border-black',
              )}
            >
              {Number(cella.slice(8, 10))}
              {cella === adesso && (
                <span className="absolute inset-x-0 bottom-0.5 text-[8px] font-extrabold uppercase">
                  oggi
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t-2 border-black bg-gray-50 px-4 py-2">
        <Legenda colore="bg-rose-300" testo="da ricevere" />
        <Legenda colore="bg-yellow-300" testo="da firmare" />
        <Legenda colore="bg-sky-300" testo="firmata" />
        <Legenda colore="bg-lime-300" testo="archiviata" />
      </div>
    </Card>
  )
}

/* ── cosa c'e' dentro un giorno ─────────────────────────────────── */

/**
 * Il giorno aperto, riga per riga.
 *
 * Risponde alla domanda che il colore non puo' contenere: rosso
 * PERCHE'. Tre cause diverse portano allo stesso rosso — non ha mandato
 * niente, ne ha mandati alcuni, ha dimenticato le proprie ore — e sono
 * tre solleciti diversi da fare.
 *
 * Mostra TUTTI i tecnici e non solo quello cliccato: il giorno e' uno, e
 * confrontare chi ha consegnato e chi no nella stessa data e' proprio
 * il gesto del titolare la mattina.
 */
function DettaglioGiorno({
  giorno,
  tecnici,
  cantieriAttivi,
  rapportini,
  ore,
  onChiudi,
}: {
  giorno: string
  tecnici: TecnicoInCampo[]
  cantieriAttivi: number
  rapportini: ConsegnaRapportino[]
  ore: ConsegnaOre[]
  onChiudi: () => void
}) {
  const navigate = useNavigate()

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-black bg-sky-300 px-5 py-3">
        <h3 className="text-base font-extrabold capitalize text-black">{dataEstesa(giorno)}</h3>
        <button
          type="button"
          onClick={onChiudi}
          className="neo-press cursor-pointer rounded-lg border-2 border-black bg-white px-2.5 py-1 text-xs font-extrabold"
        >
          Chiudi
        </button>
      </div>

      <ul className="divide-y-2 divide-black">
        {tecnici.map((t) => {
          const suoi = rapportini.filter(
            (r) => r.data === giorno && r.compilato_da === t.userId,
          )
          const sueOre =
            ore.find((o) => o.data === giorno && o.dipendente_id === t.dipendenteId) ?? null
          const bozze = suoi.filter((r) => r.stato === 'bozza').length

          return (
            <li key={t.dipendenteId} className="px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-black">{t.nominativo}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    className={cn(
                      'px-2 py-0.5 text-[10px]',
                      suoi.length - bozze >= cantieriAttivi ? 'bg-lime-300' : 'bg-rose-300',
                    )}
                  >
                    {suoi.length - bozze} di {cantieriAttivi}{' '}
                    {cantieriAttivi === 1 ? 'rapportino' : 'rapportini'}
                    {/* Le bozze NON si contano come arrivate: sono
                        scritte, ma il titolare non le ha ricevute. Un
                        conteggio che le include direbbe «7 di 8»
                        quando in mano ne ha cinque. */}
                    {bozze > 0 && ` · ${bozze} in bozza`}
                  </Badge>

                  {/* Le sue ore sono una riga a se': sono il pezzo che
                      manca piu' spesso, e dirlo con un badge diverso
                      dai rapportini evita di confondere «non ha
                      compilato i cantieri» con «non si e' segnato». */}
                  <Badge
                    className={cn(
                      'px-2 py-0.5 text-[10px]',
                      !sueOre
                        ? 'bg-rose-300'
                        : sueOre.stato === 'validato' || sueOre.stato === 'contabilizzato'
                          ? 'bg-lime-300'
                          : 'bg-yellow-300',
                    )}
                  >
                    {!sueOre ? 'ore non dichiarate' : `sue ore: ${riassuntoOre(sueOre)}`}
                  </Badge>
                </div>
              </div>

              {/* IL CANTIERE, non «Scheda». Sette righe che dicevano
                  tutte «Scheda · validato» erano indistinguibili, e la
                  domanda del titolare e' proprio quale cantiere manca:
                  una lista che non nomina le cose non risponde.

                  Lo stato va a destra e in fondo, perche' si legge
                  DOPO: prima si cerca il cantiere, poi si guarda com'e'
                  messo. */}
              {suoi.length > 0 && (
                <ul className="mt-2 grid gap-1">
                  {suoi.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/rapportini/${r.id}`)}
                        className="neo-press flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border-2 border-black/20 px-3 py-1.5 text-left text-xs font-semibold hover:border-black hover:bg-amber-50"
                      >
                        <span className="min-w-0 truncate">
                          {r.cantieri?.codice && (
                            <span className="font-bold">{r.cantieri.codice} — </span>
                          )}
                          {r.cantieri?.denominazione ?? 'Cantiere non indicato'}
                        </span>
                        <span className="shrink-0 font-bold uppercase text-gray-600">
                          {r.stato}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* DUE SOLLECITI DIVERSI, e il titolare deve sapere quale
                  fare. Una scheda in bozza e' scritta e ferma — «mandala»
                  — mentre una che non esiste e' «compilala»: chiedere la
                  cosa sbagliata fa perdere credibilita' al sollecito.

                  Dal 2026-09-22, quando si e' scoperto che Zito aveva due
                  giornate in bozza da giorni e niente lo diceva. Le bozze
                  le vede solo chi le ha scritte, quindi qui si conta
                  quello che c'e': la RLS mostra al titolare i rapportini
                  dei cantieri, bozze comprese. */}
              {bozze > 0 && (
                <p className="mt-1 text-xs font-bold text-amber-800">
                  {bozze === 1
                    ? '1 scheda è scritta ma non inviata: deve mandarla.'
                    : `${bozze} schede sono scritte ma non inviate: deve mandarle.`}
                </p>
              )}

              {sueOre?.stato === 'bozza' && (
                <p className="mt-1 text-xs font-bold text-amber-800">
                  Ha scritto le sue ore ma non le ha inviate.
                </p>
              )}

              {suoi.length === 0 && !sueOre && (
                <p className="mt-1 text-xs font-semibold text-rose-700">
                  Non è arrivato niente per questa giornata.
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

/* ── pezzi minuti ───────────────────────────────────────────────── */

function SfogliaMese({ mese, onCambia }: { mese: string; onCambia: (g: string) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        aria-label="Mese precedente"
        onClick={() => onCambia(meseIndietro(mese))}
        className="neo-press cursor-pointer rounded-lg border-2 border-black bg-white px-2.5 py-1 text-xs font-extrabold shadow-neo-sm"
      >
        ‹
      </button>
      <p className="min-w-32 text-center text-sm font-extrabold capitalize text-black">
        {meseEAnno(mese)}
      </p>
      <button
        type="button"
        aria-label="Mese successivo"
        disabled={mese.slice(0, 7) >= oggi().slice(0, 7)}
        onClick={() => onCambia(meseAvanti(mese))}
        className="neo-press cursor-pointer rounded-lg border-2 border-black bg-white px-2.5 py-1 text-xs font-extrabold shadow-neo-sm disabled:cursor-not-allowed disabled:text-gray-300"
      >
        ›
      </button>
    </div>
  )
}

/**
 * Le ore proprie in poche parole: QUANTE, e come stanno.
 *
 * Diceva solo lo stato — «sue ore: inviato» — e non bastava: il
 * titolare sapeva che erano arrivate, non se erano otto o quattro, che
 * sono due giornate diverse. Segnalato il 2026-09-22.
 *
 * L'assenza si nomina quando c'e', perche' e' proprio il caso che
 * spiega una giornata corta: «4 h · malattia» si legge da solo, mentre
 * un «4 h» solitario sembra un errore da andare a chiedere.
 */
function riassuntoOre(o: ConsegnaOre): string {
  const lavorate = Number(o.ore_ordinarie ?? 0) + Number(o.ore_straordinarie ?? 0)
  const assenza = Number(o.ore_assenza ?? 0)

  const pezzi = [`${numero(lavorate)} h`]
  if (assenza > 0) pezzi.push(o.tipo_assenza ?? 'assenza')
  // Lo stato resta, ma in coda: prima cosa ha fatto, poi a che punto e'.
  pezzi.push(o.stato)

  return pezzi.join(' · ')
}

function Legenda({ colore, testo }: { colore: string; testo: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('h-3 w-3 rounded border-2 border-black', colore)} />
      <span className="text-[10px] font-bold uppercase tracking-wide text-gray-600">{testo}</span>
    </span>
  )
}

function descrizione(stato: StatoGiornata): string {
  if (stato === 'rosso') return 'Manca qualcosa: apri il giorno per sapere cosa'
  if (stato === 'giallo') return 'Arrivata, aspetta la tua firma'
  if (stato === 'azzurro') return 'Firmata. Aspetta il riepilogo di fine mese per chiudersi'
  if (stato === 'verde') return 'Archiviata: la giornata è chiusa'
  return 'Non è arrivato niente'
}

/** Le schede di quel tecnico, indicizzate per giorno.
 *
 *  Si filtra su `compilato_da`, che e' l'utente che ha scritto la
 *  scheda: e' l'unico legame fra una persona e cio' che ha consegnato.
 *  Una scheda scritta da qualcun altro sullo stesso cantiere non e' una
 *  sua consegna e non gli va accreditata. */
function raggruppaPerGiorno(
  rapportini: ConsegnaRapportino[],
  tecnico: TecnicoInCampo,
): Map<string, ConsegnaRapportino[]> {
  const perGiorno = new Map<string, ConsegnaRapportino[]>()
  for (const r of rapportini) {
    if (r.compilato_da !== tecnico.userId) continue
    const gruppo = perGiorno.get(r.data)
    if (gruppo) gruppo.push(r)
    else perGiorno.set(r.data, [r])
  }
  return perGiorno
}

/** Le sue giornate di ore proprie, per data. Qui il legame e' il
 *  DIPENDENTE e non l'utente: `ore_personali` e' una riga di anagrafica
 *  del personale, non un documento scritto da un utente. */
function oreDelTecnico(ore: ConsegnaOre[], tecnico: TecnicoInCampo): Map<string, ConsegnaOre> {
  const perGiorno = new Map<string, ConsegnaOre>()
  for (const o of ore) {
    if (o.dipendente_id !== tecnico.dipendenteId) continue
    perGiorno.set(o.data, o)
  }
  return perGiorno
}

/* Il salto di mese passa per il primo del mese: da «31 marzo indietro di
   un mese» non esiste il 31 febbraio, e la data scivolerebbe. */
const primoDelMese = (g: string) => `${g.slice(0, 7)}-01`

function meseIndietro(g: string): string {
  return primoDelMese(giornoPiu(primoDelMese(g), -1))
}

function meseAvanti(g: string): string {
  return primoDelMese(giornoPiu(primoDelMese(g), 31))
}
