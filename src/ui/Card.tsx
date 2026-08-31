import type { HTMLAttributes } from 'react'
import { cn } from './cn'

type Props = HTMLAttributes<HTMLDivElement> & {
  /** `lg` alza il bordo a 3px e l'ombra a 8px: per contenitori che
   *  stanno da soli sullo schermo (il form di login, una modale). */
  rilievo?: 'normale' | 'lg'
}

/**
 * Niente effetto press qui: DESIGN.md dice che l'ombra si "preme" solo
 * su cio' che e' cliccabile. Una card che si muove al passaggio del
 * mouse promette un click che non esiste.
 */
export function Card({ rilievo = 'normale', className, ...props }: Props) {
  return (
    <div
      className={cn(
        'border-black bg-white',
        rilievo === 'lg'
          ? 'rounded-2xl border-3 shadow-neo-lg'
          : 'rounded-xl border-2 shadow-neo',
        className,
      )}
      {...props}
    />
  )
}
