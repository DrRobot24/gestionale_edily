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

   I TRE COLORI, che sono gli stessi per tutti:

     rosso   la giornata non e' completa: mancano schede, oppure una e'
             tornata indietro. Qualcosa e' cominciato e non e' finito.
     giallo  le schede ci sono tutte e sono partite, ma non sono ancora
             firmate.
     verde   tutte validate (o contabilizzate). Chiuso.

   Il titolare li legge con gli stessi colori del tecnico — scelta
   dell'utente il 2026-09-22 — cosi' le due schermate non si
   contraddicono: se il tecnico vede giallo, giallo vede anche il
   titolare, e stanno parlando dello stesso fatto.
   ══════════════════════════════════════════════════════════════════ */

export type StatoGiornata = 'vuota' | 'rosso' | 'giallo' | 'verde'

export const ASPETTO_GIORNATA: Record<Exclude<StatoGiornata, 'vuota'>, string> = {
  rosso: 'bg-rose-300',
  giallo: 'bg-yellow-300',
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

  const tutteChiuse = schede.every((r) => r.stato === 'validato' || r.stato === 'contabilizzato')
  return tutteChiuse ? 'verde' : 'giallo'
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
 * @param ore  `null` quando il tecnico non ha ancora compilato niente.
 */
export function statoGiornataTecnico(
  rapportini: Scheda[],
  cantieriAttesi: number,
  ore: Scheda | null,
): StatoGiornata {
  // Niente di niente: la giornata non e' cominciata. Bianca, non rossa
  // — festivi, ferie e giorni di chiusura non sono giornate perse.
  if (rapportini.length === 0 && !ore) return 'vuota'

  const pezzi: Scheda[] = ore ? [...rapportini, ore] : rapportini
  // +1 per le sue ore: fanno parte della consegna quanto i rapportini.
  return statoGiornata(pezzi, cantieriAttesi + 1)
}
