/* ══════════════════════════════════════════════════════════════════
   QUANDO SI LAVORA.

   Chiesto dall'utente il 2026-09-21: «le giornate si svolgono solo ed
   esclusivamente nei giorni feriali quindi LUN - VEN. Lascia i giorni
   prefestivi (SAB) e festivi (DOM) esenti».

   La regola sta QUI e non dentro un componente perche' la usano in tre:
   le card dei cantieri in home, il calendario della home e quello della
   scheda cantiere. Scritta tre volte, il giorno che cambia — un'impresa
   che lavora il sabato — se ne correggono due e la terza resta indietro
   senza che nessuno se ne accorga.

   ⚠️ COSA NON COPRE, detto perche' si sappia: i festivi INFRASETTIMANALI
   (Natale, Ferragosto, il santo patrono). Il 25 dicembre qui risulta un
   giorno lavorativo come un altro. Farlo per davvero vuol dire una
   tabella di festivita' con le mobili (Pasquetta) e le locali, ed e'
   lavoro vero: si fa quando l'utente lo chiede, non per anticipare.

   Nel frattempo il danno e' contenuto: su un festivo infrasettimanale
   il tecnico semplicemente non compila niente, e la giornata resta
   bianca nel calendario — che e' gia' il comportamento dei giorni senza
   schede.
   ══════════════════════════════════════════════════════════════════ */

/** Il giorno della settimana di una data `YYYY-MM-DD`, da 0 (domenica)
 *  a 6 (sabato), letto in ora locale.
 *
 *  `new Date('2026-09-21')` lo interpreterebbe come UTC e in Italia
 *  darebbe il giorno prima dopo le 22: da qui la costruzione a pezzi. */
function giornoSettimana(iso: string): number {
  const [a, m, g] = iso.split('-').map(Number)
  return new Date(a, m - 1, g).getDay()
}

/** Sabato: prefestivo. Non si lavora, ma non e' festivo. */
export function eSabato(iso: string): boolean {
  return giornoSettimana(iso) === 6
}

/** Domenica: festivo. */
export function eDomenica(iso: string): boolean {
  return giornoSettimana(iso) === 0
}

/** Sabato o domenica: i giorni in cui non si compilano rapportini. */
export function eFineSettimana(iso: string): boolean {
  const g = giornoSettimana(iso)
  return g === 0 || g === 6
}

/** Da lunedi' a venerdi'. */
export function eFeriale(iso: string): boolean {
  return !eFineSettimana(iso)
}

/** Come si chiama quel giorno, per dirlo in pagina. */
export function nomeNonFeriale(iso: string): string | null {
  if (eDomenica(iso)) return 'domenica'
  if (eSabato(iso)) return 'sabato'
  return null
}

/** Il primo giorno feriale a partire da una data, andando indietro.
 *
 *  Serve quando si apre una schermata su un giorno che non si lavora:
 *  invece di mostrare il vuoto, si porta chi guarda all'ultimo giorno
 *  che ha senso guardare. Indietro e non avanti, perche' il lavoro si
 *  registra dopo averlo fatto. */
export function ultimoFeriale(iso: string): string {
  const [a, m, g] = iso.split('-').map(Number)
  const d = new Date(a, m - 1, g)
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() - 1)
  }
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const gg = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${gg}`
}
