/**
 * Formattazione italiana, definita una volta sola.
 *
 * Gli Intl.*Format sono costosi da costruire e vengono ricreati a ogni
 * render se li scrivi dentro un componente. Qui sono a livello di
 * modulo: costruiti una volta, riusati sempre.
 */

const EURO = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
})

const DATA = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const NUMERO = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 })

/** Per le intestazioni: "giovedi 9 settembre". Il giorno della settimana
 *  non e' un vezzo — chi sfoglia le giornate arretrate ragiona per
 *  "quel martedi", non per "il 09/09". */
const DATA_ESTESA = new Intl.DateTimeFormat('it-IT', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

/** Come DATA_ESTESA ma con l'anno: per l'intestazione della home, dove
 *  la data e' il titolo della pagina e non un riferimento di passaggio.
 *  Chi apre il gestionale la mattina deve leggere che giorno e' senza
 *  dover decifrare 10/09/2026. */
const DATA_LUNGA = new Intl.DateTimeFormat('it-IT', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** `null` diventa una lineetta, non "€ 0,00": un importo assente e un
 *  importo pari a zero sono cose diverse e vanno lette diverse. */
export function euro(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return EURO.format(v)
}

export function numero(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return NUMERO.format(v)
}

/** Le date di Postgres arrivano come 'YYYY-MM-DD'. Costruire un Date da
 *  quella stringa la interpreta come UTC mezzanotte, che in Italia puo'
 *  diventare il giorno prima. Spezziamo i pezzi a mano ed evitiamo il
 *  fuso del tutto: qui una data e' un giorno del calendario, non un
 *  istante nel tempo. */
export function data(v: string | null | undefined): string {
  if (!v) return '—'
  const [a, m, g] = v.slice(0, 10).split('-').map(Number)
  if (!a || !m || !g) return '—'
  return DATA.format(new Date(a, m - 1, g))
}

/** Come `data`, ma per esteso e con il giorno della settimana. Stessa
 *  avvertenza sul fuso: la stringa si spezza a mano. */
export function dataEstesa(v: string | null | undefined): string {
  if (!v) return '—'
  const [a, m, g] = v.slice(0, 10).split('-').map(Number)
  if (!a || !m || !g) return '—'
  return DATA_ESTESA.format(new Date(a, m - 1, g))
}

/** Come `dataEstesa`, con l'anno in coda. */
export function dataLunga(v: string | null | undefined): string {
  if (!v) return '—'
  const [a, m, g] = v.slice(0, 10).split('-').map(Number)
  if (!a || !m || !g) return '—'
  return DATA_LUNGA.format(new Date(a, m - 1, g))
}

/** 'HH:MM:SS' → 'HH:MM'. In cantiere i secondi non servono a nessuno. */
export function ora(v: string | null | undefined): string {
  if (!v) return '—'
  return v.slice(0, 5)
}

/* ── Aritmetica dei giorni ──────────────────────────────────────────
   Qui una data e' un GIORNO DEL CALENDARIO scritto 'YYYY-MM-DD', non un
   istante: si spezza a mano e si ricostruisce a mano. Passare da `new
   Date('2026-09-15')` la interpreterebbe come UTC mezzanotte, che in
   Italia e' il 14 alle 02:00 — e le frecce del calendario salterebbero
   un giorno secondo il fuso. Tutte le funzioni qui sotto tengono il
   giorno locale e non toccano mai le ore.
   ────────────────────────────────────────────────────────────────── */

const MESE = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' })

/** 'YYYY-MM-DD' → Date locale a mezzanotte. Interna: fuori da qui le
 *  date restano stringhe, che e' come le scrive e le legge Postgres. */
function aData(v: string): Date {
  const [a, m, g] = v.slice(0, 10).split('-').map(Number)
  return new Date(a, m - 1, g)
}

/** Date → 'YYYY-MM-DD' locale. `sv-SE` da' esattamente quel formato: e'
 *  lo stesso trucco di `oggi()` in campiRapportino. */
function aStringa(d: Date): string {
  return d.toLocaleDateString('sv-SE')
}

/** Il giorno spostato di `quanti` giorni, avanti o indietro. Passa da
 *  `setDate`, che gestisce da solo i cambi di mese e gli anni
 *  bisestili. */
export function giornoPiu(v: string, quanti: number): string {
  const d = aData(v)
  d.setDate(d.getDate() + quanti)
  return aStringa(d)
}

/** "settembre 2026", per l'intestazione del calendarietto. */
export function meseEAnno(v: string): string {
  return MESE.format(aData(v))
}

/**
 * Le celle del mese che contiene `v`, allineate a una griglia che
 * comincia di LUNEDI'.
 *
 * Restituisce sempre righe intere da sette caselle: le posizioni prima
 * del primo del mese e dopo l'ultimo sono `null`, non giorni del mese
 * vicino. Un calendario da scrivania che mostra il 31 agosto dentro
 * settembre invita a cliccarlo, e qui un click vuol dire "apri quella
 * giornata": meglio una casella vuota che una porta verso un mese che
 * non stiamo guardando.
 */
export function griglieDelMese(v: string): (string | null)[] {
  const d = aData(v)
  const anno = d.getFullYear()
  const mese = d.getMonth()

  const primo = new Date(anno, mese, 1)
  const quantiGiorni = new Date(anno, mese + 1, 0).getDate()

  // getDay() da' 0 per domenica; qui la settimana parte da lunedi'.
  const vuotePrima = (primo.getDay() + 6) % 7

  const celle: (string | null)[] = Array(vuotePrima).fill(null)
  for (let g = 1; g <= quantiGiorni; g++) {
    celle.push(aStringa(new Date(anno, mese, g)))
  }
  while (celle.length % 7 !== 0) celle.push(null)

  return celle
}
