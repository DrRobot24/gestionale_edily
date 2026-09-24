import { Avviso, cn } from '../../ui'
import { useSession } from '../auth/SessionProvider'
import { useRapportini } from '../rapportini/useRapportini'
import { Benvenuto } from './Benvenuto'
import { CalendarioGiornate } from './CalendarioGiornate'
import { CantieriDelGiorno } from './CantieriDelGiorno'
import { ConsegneDalCampo } from './ConsegneDalCampo'
import { RimastoIndietro } from './RimastoIndietro'
import { ControlloOre } from './ControlloOre'
import { MieOre } from './MieOre'
import { GiornateDaValidare } from './GiornateDaValidare'
import { IlSuoLavoro } from './IlSuoLavoro'
import { OreArrivate } from './OreArrivate'
import { oggi } from '../rapportini/campiRapportino'
import { useDataInIndirizzo } from './useDataInIndirizzo'

/* ══════════════════════════════════════════════════════════════════
   La home mostra cosa aspetta TE, non cosa sai fare.

   Prima qui c'era l'elenco dei permessi attivi: una schermata di
   diagnostica, utile mentre si costruiva il modello dei ruoli e inutile
   a chi deve lavorare. Chi apre il gestionale la mattina ha una sola
   domanda — "cosa devo fare adesso" — e la risposta cambia col ruolo:

     chi valida    i rapportini che aspettano una firma
     chi compila   quelli respinti, col motivo, e le bozze ferme
     chi contabilizza  quelli validati che non sono ancora entrati nei conti

   Le sezioni si accendono sui PERMESSI, non sui ruoli: e' la stessa
   regola del menu, e vuol dire che aggiungere un permesso a un ruolo fa
   comparire la sezione senza toccare questo file.

   Nessuna query nuova: tutto esce da useRapportini(), che la RLS ha gia'
   filtrato per azienda e per cantieri di competenza.
   ══════════════════════════════════════════════════════════════════ */

export function Dashboard() {
  const { can } = useSession()
  /* La query resta anche se le sue righe non si leggono piu' qui: da
     quando «Da correggere» e' confluito in `RimastoIndietro`, di
     `useRapportini` servono solo `isPending` ed `error`, che reggono il
     caricamento e l'errore di tutta la pagina. Non e' uno spreco — la
     cache e' condivisa con le card dei cantieri e col calendario, che
     la chiamano comunque. */
  const { isPending, error } = useRapportini()

  /* Il giorno guardato vive QUI e non dentro le card, perche' e' uno
     solo per tutta la pagina: le frecce, le schede dei cantieri, il
     controllo delle ore e il calendario devono parlare dello stesso
     giorno. Tenerlo in ognuno di loro vorrebbe dire quattro idee di
     «oggi» che si separano al primo click. */

  /* IL DEFAULT E' SEMPRE OGGI, e ci si torna dopo averlo cambiato.
     Richiesto dall'utente il 2026-09-17: «se oggi e' 17 settembre io
     DEVO potere vedere 17 settembre».

     Dal 2026-09-15 al 2026-09-17 qui c'era `suggerisciGiorno()`, che
     apriva su IERI quando ieri era rimasto incompleto. Il ragionamento
     era la prassi «si compila oggi per ieri», e sulla carta risparmiava
     un click ogni mattina. Provato, si e' rivelato sbagliato per un
     motivo che le previsioni non avevano visto: una dashboard che si
     apre su una data diversa da oggi fa DUBITARE di quello che mostra —
     chi guarda deve prima accorgersi di che giorno sta leggendo, e ogni
     numero sotto va reinterpretato. Il click risparmiato non vale la
     certezza persa.

     Le frecce nella fascia restano, e sono la strada per andare a ieri:
     un gesto esplicito, dove sai sempre dove sei. */
  /* IL GIORNO PUO' ARRIVARE DALL'INDIRIZZO, e deve: «Hai lasciato
     indietro» manda qui con `?data=` per far vedere una giornata
     rimasta ferma, ed e' l'unico posto dove esiste il pulsante che la
     spedisce — l'invio e' della giornata, non della singola scheda.
     Senza leggerlo, quel collegamento porterebbe a oggi e chi lo segue
     si troverebbe davanti la giornata sbagliata senza capire perche'.

     Stessa validazione di `MieOrePage`: un valore fuori formato o nel
     futuro viene ignorato invece che creduto, perche' l'indirizzo lo
     puo' scrivere chiunque.

     DAL 2026-09-23 L'INDIRIZZO COMANDA SEMPRE, non solo all'apertura:
     anche le frecce e il calendario ci scrivono, cosi' il tasto
     indietro da un rapportino riporta al giorno che si stava guardando
     invece che a oggi. Vedi `useDataInIndirizzo`. */
  const [scelta, setScelta] = useDataInIndirizzo('data')
  const giorno = scelta ?? oggi()
  /* Oggi non si scrive nell'indirizzo: la home pulita e' gia' oggi. */
  const setGiorno = (g: string) => setScelta(g === oggi() ? null : g)

  const puoValidare = can('rapportini.validate')
  const puoCompilare = can('rapportini.create')

  return (
    /* Piu' larga per chi valida: la sua home e' su due colonne (vedi
       sotto), e in 5xl la colonna del calendario restava schiacciata. */
    <div className={cn('mx-auto grid gap-6', puoValidare ? 'max-w-7xl' : 'max-w-5xl')}>
      {/* Le frecce stanno nella fascia, ai lati della data: la data
          grande e' il titolo della pagina, e il posto per cambiarla e'
          quello dove la si legge. Chi non compila la riceve senza
          frecce — sfogliare le giornate del tecnico non gli serve. */}
      {puoCompilare ? <Benvenuto giorno={giorno} onCambia={setGiorno} /> : <Benvenuto />}

      {/* COSA HAI LASCIATO INDIETRO, subito sotto il saluto e sopra
          ogni altra cosa.

          Tutto il resto di questa home parla del GIORNO che si sta
          guardando — le card, le ore, il calendario. Questo parla di
          cio' che e' rimasto fermo nei giorni passati, ed e' l'unica
          cosa che non si scopre altrimenti: una bozza di martedi'
          scorso non compare in nessuna scheda, e il calendario la
          colora di rosso insieme ai giorni in cui non si e' fatto
          niente.

          Il 2026-09-22 e' emerso quanto costa: Zito aveva quattro
          giornate ferme in due punti diversi — due mai inviate, due in
          attesa da cinque giorni — e per saperlo si e' dovuto
          interrogare il database. «Consapevolezza al massimo», ha detto
          l'utente.

          Sparisce del tutto quando non c'e' niente: nessun riquadro
          verde «sei in pari». */}
      {puoCompilare && <RimastoIndietro />}

      {error && (
        <Avviso tono="errore">Non riesco a leggere i rapportini: {error.message}</Avviso>
      )}
      {isPending && <p className="text-sm font-bold text-gray-600">Carico la situazione…</p>}

      {!isPending && !error && (
        <div className="grid gap-6">
          {/* ── Chi valida: DUE COLONNE, dal 2026-09-24 ──

              «Non e' troppo dispersiva?», l'utente guardando la home di
              Giuseppe. Lo era: tutto in una colonna stretta, meta'
              schermo vuoto a destra, e le due cose che fa — firmare e
              sollecitare — una sotto l'altra da scorrere.

              A sinistra, larga, la coda da firmare: e' il lavoro per
              cui apre la pagina. A destra, stretta, il calendario di chi
              deve ancora consegnare: si guarda di lato, e il dettaglio
              di un giorno compare sotto il calendario solo quando lo si
              clicca. Sul telefono tornano una sotto l'altra, nello
              stesso ordine. */}
          {/* I registri in cima, in una riga sola: la situazione
              dell'impresa prima della coda. Vedi `IlSuoLavoro`. */}
          {puoValidare && <IlSuoLavoro compatto />}

          {puoValidare && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
              <GiornateDaValidare />
              <ConsegneDalCampo />
            </div>
          )}

          {/* Le consegne dal campo STANNO SOTTO la coda da validare, e
              l'ordine e' quello del lavoro: prima cio' che e' arrivato
              e aspetta la sua firma — un gesto da fare adesso — poi
              cio' che NON e' arrivato, che e' un sollecito da fare a
              qualcun altro.

              Chiesto dall'utente il 2026-09-22: «voglio sapere, di
              tutti i cantieri che gli ho assegnato, se mi ha fatto i
              rapportini e se mi ha inviato il foglio di giornata
              incluso delle sue ore». Il calendario da solo non basta a
              rispondere: il colore dice CHE manca qualcosa, il giorno
              aperto dice COSA.

              Sul permesso `rapportini.validate` e non sul ruolo, come
              ovunque qui: il giorno che la firma va a qualcun altro, il
              riquadro lo segue senza toccare questo file. */}

          {/* ── Chi compila: prima la giornata, poi le code ── */}
          {puoCompilare && (
            <>
              <CantieriDelGiorno giorno={giorno} onCambiaGiorno={setGiorno} />

              {/* Il calendario sta SOTTO le card e SOPRA le code, e la
                  posizione e' ragionata. Sopra le card no: chi apre
                  l'app alle sette deve incontrare cosa fare adesso, non
                  una griglia di quaranta caselle da interpretare — e le
                  frecce nella fascia fanno gia' il gesto quotidiano,
                  che con la prassi «oggi per ieri» e' un passo solo.
                  Dentro la sequenza card → invio nemmeno: spezzerebbe
                  in due il «guarda le schede, poi mandale». Qui e' il
                  contesto che viene dopo il presente.

                  TRE COLONNE, e non e' una scelta estetica. Da solo, il
                  calendario stretto lasciava mezza riga bianca — «è
                  follia», ha detto l'utente, e aveva ragione: in una
                  dashboard uno spazio vuoto e' spazio che qualcuno ha
                  dimenticato di usare.

                  I tre riquadri rispondono a tre domande diverse sullo
                  stesso giorno, e per questo stanno affiancati invece
                  che in fila: dove sto nel mese, quante ore ha fatto la
                  squadra, quante ne ho fatte io. Sul telefono si
                  impilano in quest'ordine. */}
              <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
                <CalendarioGiornate giorno={giorno} onScegli={setGiorno} />
                <ControlloOre giorno={giorno} />
                {/* Le ore di chi compila. Erano l'unica cosa che la
                    giornata non diceva: il tecnico passa in cantiere e
                    lavora come tutti, ma finora le sue ore comparivano
                    solo come divieto accanto al pulsante di invio, e
                    solo a giornata gia' completa. */}
                <MieOre giorno={giorno} />
              </div>

              {/* QUI STAVA «Da correggere», tolto il 2026-09-22.

                  Elencava i rapportini respinti col motivo, ed era
                  giusto — ma da quando c'e' «Hai lasciato indietro» in
                  cima alla pagina, quelle stesse righe comparivano due
                  volte nella stessa schermata. E il doppione era anche
                  peggio di un doppione: in fondo alla home diceva la
                  meta' della storia, perche' guardava solo i rapportini
                  e ignorava le ore proprie respinte e le bozze mai
                  inviate.

                  Il riquadro nuovo le tiene insieme tutte, in cima, con
                  i respinti per primi. Vedi `RimastoIndietro`. */}

            </>
          )}

          {/* ── Chi tiene i registri: le anagrafiche, non i rapportini ──

              Qui c'era «Validati, non ancora in contabilità», una coda
              di RAPPORTINI. Tolta il 2026-09-17 su indicazione
              dell'utente, ed e' la stessa decisione del 2026-09-15 che
              li ha tolti dal menu di Stefania, arrivata fin qui: il
              rapportino e' il documento di chi compila in cantiere, e a
              chi tiene l'amministrazione non dice niente su cosa deve
              fare adesso. Elencarli in home era chiederle di guardare
              ogni mattina una lista su cui non ha nessuna azione.

              Al suo posto il punto di partenza del suo lavoro vero: i
              registri che riempie lei, con quanti ne ha dentro. */}

          {/* Le ore arrivate STANNO SOPRA i registri, ed e' l'ordine
              del lavoro: i registri sono il fondo che si riempie una
              volta e si ritocca, le ore sono cio' che cambia ogni
              giorno e su cui si agisce adesso.

              `paghe.read` e non il ruolo, come sempre: e' il permesso di
              chi le ore deve elaborarle. Il riquadro sparisce da solo
              quando non c'e' niente di nuovo — la home mostra cose da
              fare, mai una bacheca di cio' che e' gia' andato bene.

              MA NON A CHI VALIDA. E' la stessa separazione dei compiti
              che decide chi contabilizza: `owner` ha tutti e sedici i
              permessi, quindi `paghe.read` da solo avrebbe messo il
              riquadro anche in home a Giuseppe — dove non gli serve,
              perche' le ore che arrivano le ha appena mandate lui
              firmandole. A lui dice cio' che ha gia' fatto, che e'
              esattamente la bacheca che la home non deve essere.
              Segnalato dall'utente il 2026-09-22 guardando la sua home.

              Si esprime con l'assenza, come li': elabora le ore chi
              tiene le paghe e NON valida. Regge su tutti i ruoli —
              owner e admin validano e restano fuori, amministrazione ha
              `paghe.read` senza `rapportini.validate` ed entra. */}
          {can('paghe.read') && !puoValidare && <OreArrivate />}

          {/* I registri a riquadri pieni per chi li tiene e non
              valida — Stefania. Il titolare li ha in cima, compatti. */}
          {!puoValidare && <IlSuoLavoro />}
        </div>
      )}
    </div>
  )
}
