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
     azzurro  il titolare ha firmato (validazione ①), ma la giornata non
              e' ancora archiviata: aspetta il Riepilogo Economico di
              fine mese e la seconda firma.
     verde    contabilizzata. La giornata e' CHIUSA davvero.

   Il titolare li legge con gli stessi colori del tecnico — scelta
   dell'utente il 2026-09-22 — cosi' le due schermate non si
   contraddicono: se il tecnico vede giallo, giallo vede anche il
   titolare, e stanno parlando dello stesso fatto.

   ── PERCHE' L'AZZURRO, aggiunto il 2026-09-22 ───────────────────────

   Spiegando il processo, l'utente ha chiarito che la firma del titolare
   NON chiude la giornata: apre il secondo tempo. I dati passano a
   Stefania, che a fine mese solare manda il Riepilogo Economico, e solo
   dopo la seconda firma la giornata va in archivio.

   Fra le due firme c'e' un limbo che dura settimane — il 3 settembre
   resta validato fino al 30 — e prima l'azzurro non esisteva: quelle
   giornate erano verdi, cioe' dichiarate chiuse quando erano a meta'
   strada. Adesso il verde vuol dire archiviata, e si vede a colpo
   d'occhio cosa ha finito il suo giro e cosa no.

   ⚠️ CONSEGUENZA PREVISTA: per gran parte del mese il calendario del
   titolare sara' quasi tutto azzurro, e il verde arrivera' in blocco a
   fine mese. Non e' un difetto, e' la verita' del processo — ma se in
   ufficio risultera' che «il verde non lo vedo mai», la lettura da dare
   e' che il verde e' diventato un evento mensile.
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

  /* Il verde e' l'ARCHIVIO, non la firma del titolare. Sono tutte
     `contabilizzato`: il Riepilogo Economico di fine mese e' passato e
     Giuseppe ha firmato la seconda volta. La giornata ha finito il suo
     giro.

     Una giornata mista — qualche scheda contabilizzata e qualche altra
     solo validata — resta AZZURRA, non verde: non e' archiviata finche'
     non lo sono tutti i suoi pezzi. E' la definizione stessa di
     «giornata conclusa» decisa con l'utente, visto che il foglio non
     esiste come riga e lo stato si calcola dai rapportini. */
  const tutteArchiviate = schede.every((r) => r.stato === 'contabilizzato')
  if (tutteArchiviate) return 'verde'

  // Tutte firmate ma non ancora archiviate: il limbo fra le due firme.
  const tutteFirmate = schede.every(
    (r) => r.stato === 'validato' || r.stato === 'contabilizzato',
  )
  return tutteFirmate ? 'azzurro' : 'giallo'
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
export function statoGiornataTecnico(
  rapportini: Scheda[],
  cantieriAttesi: number,
  ore: Scheda | null,
  /** Sabato o domenica: vedi sotto, cambia cosa si ha diritto di
   *  aspettarsi. Ha un valore di riserva perche' il calendario del
   *  tecnico non gliel'ha ancora passato, e li' il difetto non si vede
   *  — ma quando lo passera', la regola e' gia' qui. */
  nonFeriale = false,
): StatoGiornata {
  // Niente di niente: la giornata non e' cominciata. Bianca, non rossa
  // — festivi, ferie e giorni di chiusura non sono giornate perse.
  if (rapportini.length === 0 && !ore) return 'vuota'

  const pezzi: Scheda[] = ore ? [...rapportini, tradotte(ore)] : rapportini

  /* ── SABATO E DOMENICA NON SI ASPETTANO NIENTE ────────────────────

     Dall'utente, il 2026-09-22: «cosa c'entrano i sabati e le domeniche
     in rosso? Se non ci sono lavorazioni che rapportini ti devono
     mandare? Solo se si lavora verranno fatti e lo si sa di volta in
     volta».

     Il principio e' quello: nel fine settimana non si lavora finche'
     non risulta il contrario, e il contrario si scopre perche' arriva
     una scheda — non perche' il programma lo pretende in anticipo.

     Quindi l'attesa scende a ZERO, e il ramo «ne mancano all'appello»
     non puo' scattare. Restano vivi gli altri due motivi di rosso, e
     devono restarlo: una scheda di sabato scritta e non inviata, o
     respinta, e' ferma esattamente come in un giorno feriale.

     Un sabato lavorato e consegnato e' percio' giallo, poi azzurro,
     poi verde come tutti gli altri giorni — e' un giorno di lavoro
     vero, solo non dovuto.

     ⚠️ PERCHE' QUI E NON IN PAGINA: il conteggio «quante giornate da
     ricevere» saltava gia' il fine settimana per conto suo, mentre il
     colore no. La stessa card diceva «4 da ricevere» con sei caselle
     rosse sotto, ed e' proprio il genere di incoerenza che toglie
     fiducia a tutto il riquadro. Ora la regola e' una e sta in un
     posto solo: le due letture non possono piu' divergere. */
  const attesi = nonFeriale ? 0 : cantieriAttesi + 1

  // +1 per le sue ore: fanno parte della consegna quanto i rapportini.
  return statoGiornata(pezzi, attesi)
}

/** Le ore proprie nel vocabolario dei rapportini: vedi la nota sopra. */
function tradotte(ore: Scheda): Scheda {
  return ore.stato === 'validato' ? { stato: 'contabilizzato' } : ore
}
