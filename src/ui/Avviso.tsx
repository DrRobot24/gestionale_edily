import type { HTMLAttributes } from 'react'
import { cn } from './cn'

type Tono = 'errore' | 'successo' | 'info'

const toni: Record<Tono, string> = {
  errore: 'bg-rose-300',
  successo: 'bg-lime-300',
  info: 'bg-sky-300',
}

type Props = HTMLAttributes<HTMLDivElement> & { tono?: Tono }

/**
 * Il riquadro di messaggio a tutta larghezza (errore di login, esito di
 * un salvataggio). Testo sempre nero anche sul rosso: DESIGN.md dice
 * "su accento: text-black, mai bianco", ed e' anche la scelta piu'
 * leggibile su questi pastelli.
 *
 * Gli errori sono role="alert" perche' vanno annunciati; il resto e'
 * role="status", che non interrompe chi sta leggendo altro.
 */
export function Avviso({ tono = 'info', className, ...props }: Props) {
  return (
    <div
      role={tono === 'errore' ? 'alert' : 'status'}
      className={cn(
        'rounded-xl border-2 border-black px-4 py-2.5 text-xs font-bold text-black',
        toni[tono],
        className,
      )}
      {...props}
    />
  )
}
