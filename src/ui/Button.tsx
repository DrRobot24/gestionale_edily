import type { ButtonHTMLAttributes } from 'react'
import { cn } from './cn'

type Variante = 'primario' | 'secondario' | 'danger'
type Dimensione = 'sm' | 'md'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante
  dimensione?: Dimensione
}

/**
 * DESIGN.md prevede tre bottoni con padding leggermente diversi fra loro
 * (il danger e' piu' stretto). Quella differenza pero' non significa
 * niente: e' un residuo di come sono stati scritti, non una regola. Qui
 * il padding dipende dalla DIMENSIONE e il colore dalla VARIANTE, che
 * sono due cose indipendenti. Cosi' esiste anche un primario piccolo,
 * che con le classi copiate a mano non esisteva.
 */
const varianti: Record<Variante, string> = {
  primario: 'bg-amber-400 shadow-neo',
  secondario: 'bg-white shadow-neo-sm',
  danger: 'bg-rose-300 shadow-neo-sm',
}

const dimensioni: Record<Dimensione, string> = {
  sm: 'px-4 py-2 text-xs',
  md: 'px-5 py-2.5 text-sm',
}

/**
 * `type="button"` come default e' voluto: in HTML un <button> dentro un
 * <form> senza type fa submit. E' la sorgente di bug piu' banale e piu'
 * frequente che ci sia — un bottone "Annulla" che invia il form. Chi
 * vuole il submit lo scrive esplicito.
 */
export function Button({
  variante = 'secondario',
  dimensione = 'md',
  className,
  type = 'button',
  ...props
}: Props) {
  return (
    <button
      type={type}
      className={cn(
        'neo-press cursor-pointer rounded-xl border-2 border-black font-bold text-black',
        varianti[variante],
        dimensioni[dimensione],
        className,
      )}
      {...props}
    />
  )
}
