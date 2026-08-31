import type { HTMLAttributes } from 'react'
import { cn } from './cn'

/**
 * I colori hanno nomi di RUOLO, non di tinta. Se un giorno "successo"
 * smette di essere lime e diventa verde, si cambia qui e non in trenta
 * componenti che dicevano `bg-lime-300`.
 *
 * `neutro` non e' in DESIGN.md ed e' un'aggiunta pensata per il
 * gestionale: quando in una lista quasi tutte le righe hanno un badge,
 * colorarli tutti li rende invisibili. Il neutro e' il "nessuno stato
 * particolare" da cui gli altri si staccano.
 */
type Colore = 'primario' | 'info' | 'successo' | 'attesa' | 'errore' | 'accento' | 'neutro'

const colori: Record<Colore, string> = {
  primario: 'bg-amber-400',
  info: 'bg-sky-300',
  successo: 'bg-lime-300',
  attesa: 'bg-yellow-300',
  errore: 'bg-rose-300',
  accento: 'bg-violet-300',
  neutro: 'bg-white',
}

type Props = HTMLAttributes<HTMLSpanElement> & { colore?: Colore }

export function Badge({ colore = 'neutro', className, ...props }: Props) {
  return (
    <span
      className={cn(
        'inline-block rounded-full border-2 border-black px-3 py-1 text-xs font-bold uppercase text-black',
        colori[colore],
        className,
      )}
      {...props}
    />
  )
}
