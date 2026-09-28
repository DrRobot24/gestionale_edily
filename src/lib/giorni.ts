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

/* ══════════════════════════════════════════════════════════════════
   LE FESTIVITA' NAZIONALI, dal 2026-09-28 — le «rosse di calendario».

   Chieste dall'utente per la tariffa della paga globale: i giorni per
   cui si divide la paga sono i FERIALI del mese, «quindi escludi i
   festivi e le festivita' rosse di calendario italiano».

   Calcolate nel codice e non in una tabella: sono dieci date fisse piu'
   Pasquetta, e Pasqua si ricava con una formula — non c'e' niente da
   aggiungere a mano ogni anno. Il PATRONO locale non c'e': cambia da
   comune a comune, e va deciso con l'utente se e quale.

   ⚠️ PER ORA LE USA SOLO LA TARIFFA (`giorniLavorabili`). Calendari,
   card e invio continuano a guardare `eFineSettimana`: un festivo
   infrasettimanale li' risulta ancora un giorno da compilare.
   ══════════════════════════════════════════════════════════════════ */

const FISSE: Record<string, string> = {
  '01-01': 'Capodanno',
  '01-06': 'Epifania',
  '04-25': 'Festa della Liberazione',
  '05-01': 'Festa dei lavoratori',
  '06-02': 'Festa della Repubblica',
  '08-15': 'Ferragosto',
  '11-01': 'Ognissanti',
  '12-08': 'Immacolata',
  '12-25': 'Natale',
  '12-26': 'Santo Stefano',
}

function isoDi(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const gg = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${gg}`
}

/** La domenica di Pasqua di un anno (calendario gregoriano, algoritmo
 *  di Meeus/Jones/Butcher). */
export function pasqua(anno: number): string {
  const a = anno % 19
  const b = Math.floor(anno / 100)
  const c = anno % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mese = Math.floor((h + l - 7 * m + 114) / 31)
  const giorno = ((h + l - 7 * m + 114) % 31) + 1
  return isoDi(new Date(anno, mese - 1, giorno))
}

/** Il nome della festivita' nazionale di quel giorno, o null. */
export function festivita(iso: string): string | null {
  const fissa = FISSE[iso.slice(5)]
  if (fissa) return fissa
  const [a, m, g] = pasqua(Number(iso.slice(0, 4))).split('-').map(Number)
  return iso === isoDi(new Date(a, m - 1, g + 1)) ? 'Lunedì dell’Angelo' : null
}

/** Da lunedi' a venerdi', e non festivo: il giorno che conta per la
 *  tariffa della paga globale. */
export function eLavorabile(iso: string): boolean {
  return eFeriale(iso) && festivita(iso) === null
}
