/* ══════════════════════════════════════════════════════════════════
   IL SEMAFORO DI UNA GIORNATA, in un posto solo.

   La regola nasce in `CalendarioGiornate`, il calendario del tecnico,
   con scritto in chiaro: «se un giorno la stessa regola servira'
   altrove — per esempio al titolare — va in un file suo, non esportata
   da qui». Quel giorno e' il 2026-09-22, ed e' questo file.

   Il motivo per cui non si esporta dal componente non e' formale:
   Vite rifiuta il fast refresh su un file che esporta un componente e
   altro insieme (`react-refresh/only-export-components`). Ma la ragione
   vera e' che due schermate ora dipendono dalla stessa regola, e una
   regola condivisa che vive dentro una delle due parti non e'
   condivisa: e' prestata.

   I COLORI, che sono gli stessi per tutti:

     rosso    la giornata non e' completa: mancano schede, oppure una e'
              tornata indietro. Qualcosa e' cominciato e non e' finito.
     giallo   le schede ci sono tutte e sono partite, ma non sono ancora
              firmate.
     verde    il titolare ha firmato (validazione ①). Per LUI la
              giornata e' fatta: ha ricevuto tutto e l'ha approvato.
     azzurro  archiviata. E' passato anche il Riepilogo Economico di
              Stefania e la seconda firma: la giornata ha finito il suo
              giro e non torna piu' indietro.

   Il titolare li legge con gli stessi colori del tecnico — scelta
   dell'utente il 2026-09-22 — cosi' le due schermate non si
   contraddicono: se il tecnico vede giallo, giallo vede anche il
   titolare, e stanno parlando dello stesso fatto.

   ── IL VERDE E' LA FIRMA DEL TITOLARE, non l'archivio ───────────────

   Deciso dall'utente il 2026-09-22, ed e' l'inverso di come l'avevo
   fatto la mattina: «voglio, in qualita' di titolare, vedere il verde
   su tutte le giornate che ho validato; poi l'azzurro dovra' apparire
   sul giorno solo quando le giornate saranno archiviate».

   Il mio primo giro teneva il verde per `contabilizzato`. Era coerente
   col processo ma sbagliato per chi guarda: il calendario e' la
   schermata del TITOLARE, e in quella schermata il traguardo e' il suo,
   non quello di Stefania. Uno che ha ricevuto tutto e ha firmato ha
   finito — il verde deve dirglielo subito, non fra due settimane.

   E c'era una conseguenza pratica che l'aveva gia' resa inutile: il
   Riepilogo Economico arriva a fine mese solare, quindi il verde non
   sarebbe MAI comparso prima del 30, e poi tutto il mese sarebbe
   diventato verde insieme. Un colore che si accende una volta al mese
   non e' un semaforo, e' un rendiconto — e in mezzo il titolare vedeva
   azzurro su giornate che per lui erano chiuse da giorni.

   L'archivio resta segnato, perche' e' un fatto vero e serve sapere
   cosa non torna piu' indietro: prende l'azzurro, che e' il colore
   giusto per una cosa conclusa e ferma. Chi ha bisogno di sapere dove
   sia arrivato il lavoro di Stefania lo legge li'.
   ══════════════════════════════════════════════════════════════════ */

export type StatoGiornata = 'vuota' | 'rosso' | 'giallo' | 'azzurro' | 'verde'

export const ASPETTO_GIORNATA: Record<Exclude<StatoGiornata, 'vuota'>, string> = {
  rosso: 'bg-rose-300',
  giallo: 'bg-yellow-300',
  azzurro: 'bg-sky-300',
  verde: 'bg-lime-300',
}

/** Il minimo che una giornata deve avere per essere giudicata. */
type Scheda = { stato: string }

/**
 * Lo stato di una giornata, dalle sue schede.
 *
 * L'ordine dei controlli non e' casuale: prima cio' che chiede lavoro,
 * poi cio' che aspetta qualcun altro. Una giornata con una scheda
 * respinta e cinque validate e' rossa, perche' quella respinta e' il
 * fatto che conta.
 *
 * @param attesi  Quante schede ci si aspetta quel giorno. Meno del
 *                previsto e' rosso: e' il caso «non me le ha mandate
 *                tutte», che e' il motivo per cui il titolare guarda
 *                questo calendario.
 */
export function statoGiornata(schede: Scheda[], attesi: number): StatoGiornata {
  if (schede.length === 0) return 'vuota'

  const respinte = schede.some((r) => r.stato === 'respinto')
  const inBozza = schede.some((r) => r.stato === 'bozza')
  if (respinte || inBozza || schede.length < attesi) return 'rosso'

  /* L'AZZURRO E' L'ARCHIVIO: tutte `contabilizzato`, cioe' il
     Riepilogo Economico di Stefania e' passato e Giuseppe ha firmato la
     seconda volta. La giornata ha finito il suo giro e non torna piu'
     indietro.

     Una giornata mista — qualche scheda archiviata e qualche altra solo
     validata — resta VERDE, non azzurra: non e' archiviata finche' non
     lo sono tutti i suoi pezzi. E' la definizione di «giornata
     conclusa» decisa con l'utente, visto che il foglio non esiste come
     riga e lo stato si calcola dai rapportini. */
  const tutteArchiviate = schede.every((r) => r.stato === 'contabilizzato')
  if (tutteArchiviate) return 'azzurro'

  /* Tutte firmate dal titolare: per LUI la giornata e' fatta, anche se
     Stefania deve ancora lavorarci. Vedi la nota in testa al file sul
     perche' il traguardo di questo calendario e' il suo. */
  const tutteFirmate = schede.every(
    (r) => r.stato === 'validato' || r.stato === 'contabilizzato',
  )
  return tutteFirmate ? 'verde' : 'giallo'
}

/**
 * Il semaforo di un tecnico in una giornata: i cantieri E le sue ore.
 *
 * E' la versione del titolare, e ha un pezzo in piu' — «incluso delle
 * sue ore», ha detto l'utente. Una giornata in cui sono arrivati tutti
 * i rapportini ma il tecnico non ha dichiarato la propria giornata NON
 * e' completa: manca il pezzo che serve alle paghe, e senza questo
 * controllo resterebbe verde per sempre senza che nessuno se ne
 * accorga. E' lo stesso buco trovato il 2026-09-22 sulle ore che non
 * arrivavano mai a Stefania, visto dall'altro capo.
 *
 * Le ore contano come una scheda in piu': se mancano, il conto non
 * torna e la giornata e' rossa; se sono arrivate ma non firmate,
 * tirano la giornata sul giallo come farebbe un rapportino inviato.
 *
 * ⚠️ LE ORE PERSONALI NON ARRIVANO A `contabilizzato`. Il loro ciclo e'
 * `bozza → inviato → validato → respinto` e basta: quello stato non
 * esiste proprio in `ore_personali`. Passarle cosi' com'e' a
 * `statoGiornata` terrebbe ogni giornata AZZURRA per sempre — anche
 * archiviata, perche' un pezzo non sarebbe mai `contabilizzato`.
 *
 * Quindi `validato` sulle ore vale quanto `contabilizzato`: per loro
 * quello E' il capolinea. Non e' una scorciatoia, e' la traduzione fra
 * due cicli di lunghezza diversa — e sta QUI, in un punto solo, invece
 * che sparsa in ogni schermata che legge le due cose insieme.
 *
 * @param ore  `null` quando il tecnico non ha ancora compilato niente.
 */
export function statoGiornataTecnico({
  rapportini,
  cantieriAttesi,
  ore,
  nonFeriale = false,
  passata = false,
  assente = false,
}: {
  rapportini: Scheda[]
  cantieriAttesi: number
  /** `null` quando il tecnico non ha ancora compilato niente. */
  ore: Scheda | null
  /** Sabato o domenica: vedi sotto, cambia cosa si ha diritto di
   *  aspettarsi. */
  nonFeriale?: boolean
  /** Il giorno e' prima di oggi. Serve al rosso del giorno VUOTO: oggi
   *  e' il giorno che si sta compilando, e colorarlo di rosso mentre ci
   *  si lavora sarebbe un rimprovero prima del tempo. */
  passata?: boolean
  /** Il tecnico quel giorno e' segnato assente (`assenze.sql`): le sue
   *  ore non si aspettano, la sua assenza ha gia' risposto. */
  assente?: boolean
}): StatoGiornata {
  /* ── IL GIORNO VUOTO E' ROSSO SE ERA DOVUTO ────────────────────────

     Fino al 2026-09-23 un giorno senza nessuna scheda restava BIANCO,
     sempre: si pensava a festivi e chiusure. L'utente l'ha visto dal
     lato giusto — «perche' non risultano rossi il 14, 15 e 16 settembre
     in cui il tecnico ha dei cantieri assegnati e non ha compilato alcun
     rapportino? E' fondamentale per il tecnico vedere il suo calendario
     con i colori semaforici».

     Aveva ragione: il bianco premiava proprio la dimenticanza totale,
     che e' la piu' grave. Un giorno con una scheda in bozza era rosso,
     un giorno senza niente era pulito.

     Il rosso scatta pero' solo quando c'era davvero qualcosa da fare:
     giorno feriale, gia' passato, e con almeno un cantiere assegnato
     QUEL giorno (dalle date di `cantiere_assegnazioni`, non da oggi).
     Prima che l'incarico cominciasse, o prima che il gestionale fosse
     in uso, il calendario resta bianco — non deve accusare di non aver
     compilato giornate in cui non c'era niente da compilare. */
  if (rapportini.length === 0 && !ore) {
    return passata && !nonFeriale && cantieriAttesi > 0 ? 'rosso' : 'vuota'
  }

  const pezzi: Scheda[] = ore ? [...rapportini, tradotte(ore)] : rapportini

  /* ── SABATO E DOMENICA NON SI ASPETTANO NIENTE ────────────────────

     Dall'utente, il 2026-09-22: «cosa c'entrano i sabati e le domeniche
     in rosso? Se non ci sono lavorazioni che rapportini ti devono
     mandare? Solo se si lavora verranno fatti e lo si sa di volta in
     volta».

     Quindi l'attesa scende a ZERO, e il ramo «ne mancano all'appello»
     non puo' scattare. Restano vivi gli altri due motivi di rosso: una
     scheda di sabato scritta e non inviata, o respinta, e' ferma
     esattamente come in un giorno feriale.

     ⚠️ PERCHE' QUI E NON IN PAGINA: il conteggio «quante giornate da
     ricevere» e il colore devono leggere la stessa regola, o la stessa
     card dice «4 da ricevere» con sei caselle rosse sotto. */
  // +1 per le sue ore: fanno parte della consegna quanto i rapportini.
  // Tranne quando e' lui l'assente: allora le sue ore non esistono.
  const attesi = nonFeriale ? 0 : cantieriAttesi + (assente ? 0 : 1)

  return statoGiornata(pezzi, attesi)
}

/** Le ore proprie nel vocabolario dei rapportini: vedi la nota sopra. */
function tradotte(ore: Scheda): Scheda {
  return ore.stato === 'validato' ? { stato: 'contabilizzato' } : ore
}
