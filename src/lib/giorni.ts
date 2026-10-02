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

   I FESTIVI INFRASETTIMANALI (Natale, Ferragosto, il patrono) sono
   arrivati il 2026-10-02: stanno piu' sotto, e chi chiede «si lavora?»
   deve usare `eLavorabile` / `nonLavorativo`, non `eFineSettimana`.
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

/** Come si chiama quel giorno, se e' sabato o domenica. */
function nomeNonFeriale(iso: string): string | null {
  if (eDomenica(iso)) return 'domenica'
  if (eSabato(iso)) return 'sabato'
  return null
}

/* ══════════════════════════════════════════════════════════════════
   LE FESTIVITA', dal 2026-09-28 — le «rosse di calendario».

   Chieste dall'utente per la tariffa della paga globale: i giorni per
   cui si divide la paga sono i FERIALI del mese, «quindi escludi i
   festivi e le festivita' rosse di calendario italiano».

   Calcolate nel codice e non in una tabella: sono dieci date fisse piu'
   Pasquetta, e Pasqua si ricava con una formula — non c'e' niente da
   aggiungere a mano ogni anno.

   DAL 2026-10-02 valgono OVUNQUE, non solo per la tariffa: calendari,
   card, foglio presenze e invio trattano un festivo come una domenica.
   E c'e' il PATRONO, una data per impresa (`azienda_calendario`, deciso
   con l'utente): le funzioni lo ricevono come argomento, e nelle pagine
   arriva gia' legato da `useCalendario`.

   ⚠️ LA STESSA REGOLA STA NEL DATABASE, in `app.festivita` di
   `supabase/schema/festivita.sql`: l'invio della giornata la usa per
   sapere cosa e' dovuto. Se cambia l'elenco qui, cambia anche li'.
   ══════════════════════════════════════════════════════════════════ */

/** Il patrono dell'impresa: «MM-GG» e, se scritto, il nome del santo. */
export type Patrono = { giorno: string; nome: string | null }

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

/** Il nome della festivita' di quel giorno, o null. Stesso ordine di
 *  `app.festivita`: le fisse, Pasquetta, il patrono. */
export function festivita(iso: string, patrono?: Patrono | null): string | null {
  const fissa = FISSE[iso.slice(5)]
  if (fissa) return fissa
  const [a, m, g] = pasqua(Number(iso.slice(0, 4))).split('-').map(Number)
  if (iso === isoDi(new Date(a, m - 1, g + 1))) return 'Lunedì dell’Angelo'
  if (patrono && iso.slice(5) === patrono.giorno) return patrono.nome?.trim() || 'Santo patrono'
  return null
}

/** Da lunedi' a venerdi', e non festivo: il giorno in cui si aspetta il
 *  lavoro, e quello che conta per la tariffa della paga globale. */
export function eLavorabile(iso: string, patrono?: Patrono | null): boolean {
  return eFeriale(iso) && festivita(iso, patrono) === null
}

/** Perche' quel giorno non si lavora, per dirlo in pagina: il nome della
 *  festa, oppure «sabato» o «domenica». null se si lavora. La festa
 *  vince sulla domenica: «Ognissanti» dice di piu'. */
export function nonLavorativo(iso: string, patrono?: Patrono | null): string | null {
  return festivita(iso, patrono) ?? nomeNonFeriale(iso)
}

/** L'ultimo giorno lavorabile a partire da una data, andando indietro.
 *
 *  Serve quando si apre una schermata su un giorno che non si lavora:
 *  invece di mostrare il vuoto, si porta chi guarda all'ultimo giorno
 *  che ha senso guardare. Indietro e non avanti, perche' il lavoro si
 *  registra dopo averlo fatto. */
export function ultimoLavorabile(iso: string, patrono?: Patrono | null): string {
  const [a, m, g] = iso.split('-').map(Number)
  const d = new Date(a, m - 1, g)
  while (!eLavorabile(isoDi(d), patrono)) d.setDate(d.getDate() - 1)
  return isoDi(d)
}
