import type { ReactNode } from 'react'
import { cn } from './cn'

/**
 * Elenco alfabetico a rubrica: i nomi a sinistra, una lettera a fare da
 * separatore quando cambia l'iniziale.
 *
 * Nasce il 2026-09-23 per Clienti e Risorse, che erano griglie di card:
 * «preferisco un elenco con i nomi e cognomi sulla sinistra in ordine
 * alfabetico». Una card per persona costringe l'occhio a zigzagare fra
 * tre colonne; un elenco si scorre dall'alto in basso come una rubrica,
 * e la lettera dice subito dove si e' arrivati.
 *
 * L'ORDINE LO FA QUI, non il database: `order()` di Postgres segue la
 * collation del server, che puo' mettere le maiuscole prima delle
 * minuscole («DETERSI» prima di «Comet»). `localeCompare` in italiano
 * ordina come ci si aspetta leggendo.
 *
 * Ogni riga e' un `button`, cosi' si raggiunge col tab e si apre con
 * Invio: la riga intera e' il bersaglio.
 */
export function Rubrica<T>({
  voci,
  nome,
  chiave,
  onApri,
  spenta,
  children,
}: {
  voci: T[]
  /** Il testo su cui si ordina e da cui si prende l'iniziale. */
  nome: (v: T) => string
  chiave: (v: T) => string
  onApri: (v: T) => void
  /** Le righe archiviate si mostrano in grigio. */
  spenta?: (v: T) => boolean
  /** Il contenuto della riga: il nome a sinistra, il resto a destra. */
  children: (v: T) => ReactNode
}) {
  const ordinate = [...voci].sort((a, b) =>
    nome(a).localeCompare(nome(b), 'it', { sensitivity: 'base' }),
  )

  const gruppi: { lettera: string; voci: T[] }[] = []
  for (const v of ordinate) {
    const lettera = iniziale(nome(v))
    const ultimo = gruppi.at(-1)
    if (ultimo?.lettera === lettera) ultimo.voci.push(v)
    else gruppi.push({ lettera, voci: [v] })
  }

  return (
    <div className="overflow-hidden rounded-xl border-2 border-black bg-white shadow-neo">
      {gruppi.map((g, i) => (
        <section key={g.lettera} aria-label={`Lettera ${g.lettera}`}>
          <h2
            className={cn(
              'border-b-2 border-black bg-amber-300 px-4 py-1 text-xs font-black text-black',
              i > 0 && 'border-t-2',
            )}
          >
            {g.lettera}
          </h2>
          <ul className="divide-y divide-gray-200">
            {g.voci.map((v) => (
              <li key={chiave(v)}>
                <button
                  type="button"
                  onClick={() => onApri(v)}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-amber-50 focus-visible:bg-amber-50 focus-visible:outline-none',
                    spenta?.(v) && 'bg-gray-50 text-gray-500',
                  )}
                >
                  {children(v)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** La lettera del separatore: senza accenti, e «#» per chi comincia con una cifra. */
function iniziale(testo: string) {
  const c = testo
    .trim()
    .charAt(0)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
  return /[A-Z]/.test(c) ? c : '#'
}
