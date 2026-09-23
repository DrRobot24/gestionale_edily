import { useDataInIndirizzo } from './useDataInIndirizzo'
import { Avviso, Badge, Card, cn } from '../../ui'
import { eFineSettimana } from '../../lib/giorni'
import { dataEstesa, griglieDelMese, giornoPiu, meseEAnno, numero } from '../../lib/formato'
import { oggi } from '../rapportini/campiRapportino'
import {
  cantieriAttesi,
  oreDelTecnico,
  raggruppaPerGiorno,
  useConsegneDelMese,
  useTecniciScollegati,
  type AttesaCantiere,
  type ConsegnaOre,
  type ConsegnaRapportino,
  type TecnicoInCampo,
} from './useConsegneDelMese'
import { ASPETTO_GIORNATA, statoGiornataTecnico, type StatoGiornata } from './statoGiornata'
import { LaGiornataDi } from './LaGiornataDi'

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

   ── IL CONTEGGIO, rifatto il 2026-09-22 ─────────────────────────────

   Una giornata e' completa quando sono arrivati i rapportini dei
   cantieri che QUEL GIORNO erano in carico a QUEL tecnico, piu' le ore
   che dichiara per se'.

   Non era cosi' fino al 2026-09-22: il conto era «quanti cantieri hanno
   stato attivo adesso», e l'utente ha visto subito cosa produceva —
   «perche' ci sono tutti questi rossi quando il tecnico l'invio l'ha
   fatto? Forse e' stato creato un cantiere e tu in maniera retroattiva
   pretendi che il tecnico faccia rapportini dopo che l'invio e' stato
   fatto?».

   Esattamente. Il 17 settembre Zito aveva consegnato sette schede su
   quattro dovute, tutte validate, ore comprese: giornata completa,
   segnata rossa perche' il programma contava gli otto cantieri di
   stasera. E l'ottavo — Family Resort — non era nemmeno suo: e' di
   Giuseppe, come direttore lavori.

   Il conto ora esce da `cantieriAttesi()`, che legge le assegnazioni
   con le loro date e le incrocia con l'apertura del cantiere. Il
   ragionamento per esteso sta in `useConsegneDelMese.ts`, accanto ai
   dati che lo alimentano.

   Il denominatore resta SCRITTO IN PAGINA — «su 4 suoi cantieri» — per
   la ragione di sempre: un rosso di cui si vede la causa e'
   un'informazione, un rosso inspiegabile e' un allarme che si impara a
   ignorare. Quello in intestazione e' pero' il conto di oggi, per dare
   una frase leggibile; il colore di ogni casella usa il suo, giorno
   per giorno.

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
  /* Mese e giorno aperto stanno NELL'INDIRIZZO (2026-09-23): chi apre
     il 17, entra in un rapportino e torna indietro deve ritrovare il 17
     aperto, non la home di oggi. Il mese, se manca, segue il giorno
     aperto. */
  const [giornoAperto, setGiornoAperto] = useDataInIndirizzo('aperto')
  const [meseScelto, setMese] = useDataInIndirizzo('mese')
  const mese = meseScelto ?? giornoAperto ?? oggi()

  const { data, isPending, error } = useConsegneDelMese(mese)
  const { data: scollegati } = useTecniciScollegati()

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
                attese={data!.attese}
                rapportini={data!.rapportini}
                ore={data!.ore}
                assenti={data!.assenti}
                giornoAperto={giornoAperto}
                onApriGiorno={(g) => setGiornoAperto(giornoAperto === g ? null : g)}
              />
            ))}
          </div>

          <div className="lg:flex-1 lg:min-w-0">
            {giornoAperto ? (
              /* DUE RIQUADRI, e rispondono a due domande diverse sullo
                 stesso giorno.

                 Sopra «cosa manca», che e' il perimetro del tecnico:
                 quante schede ha consegnato, se ha dichiarato le sue
                 ore, cosa resta in bozza. Sotto «cos'e' successo», che
                 e' la giornata intera — tutti i cantieri, tutte le
                 persone, anche cio' che e' gia' firmato e quindi non
                 manca piu' a nessuno.

                 Il secondo e' nato il 2026-09-22 da «perche' non ci
                 sono le frecce dal POV titolare?»: la risposta non
                 erano le frecce — non avrebbero mosso niente in quella
                 home — ma il fatto che «cos'e' successo giovedi' 17?»
                 non avesse un posto dove essere chiesta. */
              <div className="grid gap-4">
                <DettaglioGiorno
                  giorno={giornoAperto}
                  tecnici={tecnici}
                  attese={data!.attese}
                  rapportini={data!.rapportini}
                  ore={data!.ore}
                  assenti={data!.assenti}
                  onChiudi={() => setGiornoAperto(null)}
                />
                <LaGiornataDi giorno={giornoAperto} />
              </div>
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
  attese,
  rapportini,
  ore,
  assenti,
  giornoAperto,
  onApriGiorno,
}: {
  tecnico: TecnicoInCampo
  mese: string
  attese: AttesaCantiere[]
  rapportini: ConsegnaRapportino[]
  ore: ConsegnaOre[]
  assenti: Set<string>
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
    if (!c || c > adesso) return false
    /* IL FINE SETTIMANA NON SI SCARTA PIU' QUI: lo sa gia'
       `statoGiornataTecnico`, che con `nonFeriale` porta a zero cio'
       che si aspetta. Scartarlo anche qui nasconderebbe un sabato con
       una scheda ferma in bozza — che e' fermo per davvero e va
       sollecitato, lavorativo o no. */
    return (
      statoGiornataTecnico({
        rapportini: suoi.get(c) ?? [],
        cantieriAttesi: cantieriAttesi(attese, tecnico.userId, c),
        ore: sueOre.get(c) ?? null,
        nonFeriale: eFineSettimana(c),
        passata: c < adesso,
        assente: assenti.has(`${tecnico.dipendenteId}|${c}`),
      }) === 'rosso'
    )
  }).length

  /* Il denominatore di OGGI, solo per scriverlo nell'intestazione. Il
     colore di ogni casella usa il suo, giorno per giorno: qui serve
     una frase che dica al titolare su quanti cantieri sta guardando
     adesso, non un numero che entra nei conti. */
  const suoiOggi = cantieriAttesi(attese, tecnico.userId, adesso)

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
            su {suoiOggi} {suoiOggi === 1 ? 'suo cantiere' : 'suoi cantieri'} · più le sue ore
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

          const futuro = cella > adesso
          const nonFeriale = eFineSettimana(cella)
          const stato = statoGiornataTecnico({
            rapportini: suoi.get(cella) ?? [],
            cantieriAttesi: cantieriAttesi(attese, tecnico.userId, cella),
            ore: sueOre.get(cella) ?? null,
            nonFeriale,
            passata: cella < adesso,
            assente: assenti.has(`${tecnico.dipendenteId}|${cella}`),
          })
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
        <Legenda colore="bg-lime-300" testo="validata da te" />
        <Legenda colore="bg-sky-300" testo="archiviata" />
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
  attese,
  rapportini,
  ore,
  assenti,
  onChiudi,
}: {
  giorno: string
  tecnici: TecnicoInCampo[]
  attese: AttesaCantiere[]
  rapportini: ConsegnaRapportino[]
  ore: ConsegnaOre[]
  assenti: Set<string>
  onChiudi: () => void
}) {
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
          /* Quanti ne doveva QUEL giorno, non quanti cantieri esistono
             oggi: e' lo stesso conto che colora la casella, quindi il
             badge e il calendario non possono contraddirsi. */
          const attesi = cantieriAttesi(attese, t.userId, giorno)
          const arrivati = suoi.length - bozze
          /* IL DENOMINATORE SI VEDE SEMPRE — «voglio vedere sempre il
             denominatore, quindi 7 di 7» (utente, 2026-09-22). La
             frazione dice piu' del numero solo: «7 di 7» conferma che
             il conto torna, «7» da solo lo lascia credere.

             ⚠️ QUELLO CHE NON SI SCRIVE E' «7 DI 4», e non e' la stessa
             cosa. Un numeratore piu' grande del denominatore si legge
             come un errore di conto, non come una consegna abbondante
             — l'utente lo ha visto comparire e la reazione e' stata
             immediata. Succede per davvero: il 17 settembre Zito ha
             rapportato SETTE cantieri quando gliene toccavano quattro,
             perche' aveva gia' in mano lavoro di cantieri che gli
             sarebbero stati assegnati dopo.

             Quando arrivano piu' schede del dovuto il denominatore
             diventa il numero stesso — «7 di 7» — perche' e' cio' che
             quella giornata ha prodotto davvero, ed e' comunque
             completa. Il dettaglio sotto elenca tutte e sette le
             schede: nulla si nasconde, si evita solo di scrivere una
             frazione impossibile. */
          const completo = arrivati >= attesi
          const suQuanti = Math.max(arrivati, attesi)
          const assente = assenti.has(`${t.dipendenteId}|${giorno}`)

          /* NIENTE DA RICEVERE, NIENTE DA DIRE (2026-09-23). Quel giorno
             non aveva cantieri assegnati e non e' arrivato niente: la
             riga prima diceva «0 di 0 rapportini», «ore non dichiarate»
             in rosso e «non e' arrivato niente» — tre frasi vere che
             insieme accusavano il tecnico di una mancanza che non
             c'era. L'utente: «meglio un'informazione non data che
             un'info sbagliata». Il calendario quel giorno e' bianco, e
             il dettaglio dice la stessa cosa. */
          if (attesi === 0 && suoi.length === 0 && !sueOre) {
            return (
              <li key={t.dipendenteId} className="px-5 py-3">
                <p className="text-sm font-bold text-black">{t.nominativo}</p>
                <p className="mt-1 text-xs font-semibold text-gray-600">
                  {assente
                    ? 'Assente in questa giornata.'
                    : 'Nessun cantiere assegnato in questa giornata: non c’era niente da ricevere.'}
                </p>
              </li>
            )
          }

          return (
            <li key={t.dipendenteId} className="px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-black">{t.nominativo}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    className={cn(
                      'px-2 py-0.5 text-[10px]',
                      completo ? 'bg-lime-300' : 'bg-rose-300',
                    )}
                  >
                    {arrivati} di {suQuanti}{' '}
                    {suQuanti === 1 ? 'rapportino' : 'rapportini'}
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
                        ? assente
                          ? 'bg-gray-200'
                          : 'bg-rose-300'
                        : sueOre.stato === 'validato' || sueOre.stato === 'contabilizzato'
                          ? 'bg-lime-300'
                          : 'bg-yellow-300',
                    )}
                  >
                    {sueOre
                      ? `sue ore: ${riassuntoOre(sueOre)}`
                      : assente
                        ? 'assente'
                        : 'ore non dichiarate'}
                  </Badge>
                </div>
              </div>

              {/* QUI STAVA L'ELENCO DELLE SCHEDE, tolto il 2026-09-22:
                  «non lo stai ripetendo due volte l'elenco dei
                  rapportini validati e non?» (utente). Lo ripeteva
                  eccome — gli stessi sette cantieri, uno sotto
                  l'altro, in due riquadri attaccati.

                  Il doppione e' nato aggiungendo «La giornata di…»
                  senza guardare cosa mostrava gia' questo. Adesso i due
                  riquadri si dividono il lavoro invece di sovrapporsi:

                    QUI      il riepilogo PER TECNICO: quante schede ha
                             consegnato sulle attese, come stanno le sue
                             ore, cosa e' rimasto in bozza. Una riga per
                             persona.
                    SOTTO    l'elenco dei cantieri, con le ore di
                             ciascuno e chi c'era. Una riga per scheda.

                  La differenza non e' di quantita' ma di soggetto: qui
                  si guarda una persona, sotto una giornata. */}

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
  if (stato === 'verde') return 'Validata da te: per te è fatta'
  if (stato === 'azzurro')
    return 'Archiviata: passata anche dal riepilogo di Stefania, non torna più indietro'
  return 'Non è arrivato niente'
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
