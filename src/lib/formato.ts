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

/** 'HH:MM:SS' → 'HH:MM'. In cantiere i secondi non servono a nessuno. */
export function ora(v: string | null | undefined): string {
  if (!v) return '—'
  return v.slice(0, 5)
}
