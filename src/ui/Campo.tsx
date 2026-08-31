import { useId, type ComponentPropsWithRef, type ReactNode } from 'react'
import { cn } from './cn'

const stileControllo =
  'w-full rounded-xl border-2 border-black bg-white px-4 py-2.5 text-sm font-medium text-black ' +
  'placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 ' +
  // Lo stato di errore e' un colore PIENO, non un bordo rosso: DESIGN.md
  // vuole il bordo sempre nero e niente trasparenze. Il campo sbagliato
  // si vede a colpo d'occhio senza leggere il messaggio.
  'aria-invalid:bg-rose-100 disabled:bg-gray-100 disabled:text-gray-500'

/* ── controlli nudi, per quando il contesto rende l'etichetta superflua ── */

export function Input({ className, ...props }: ComponentPropsWithRef<'input'>) {
  return <input className={cn(stileControllo, className)} {...props} />
}

export function Select({ className, ...props }: ComponentPropsWithRef<'select'>) {
  return <select className={cn(stileControllo, 'cursor-pointer', className)} {...props} />
}

export function AreaTesto({ className, ...props }: ComponentPropsWithRef<'textarea'>) {
  return <textarea className={cn(stileControllo, 'min-h-24 resize-y', className)} {...props} />
}

/* ── versioni con etichetta ── */

/**
 * Il guscio comune: etichetta, controllo, errore.
 *
 * Il valore vero non e' il risparmio di righe, e' che `htmlFor`,
 * `aria-invalid` e `aria-describedby` diventano impossibili da
 * dimenticare. Scritti a mano si sbagliano sempre, e quando si sbagliano
 * un lettore di schermo legge un campo senza nome e senza errore.
 */
function Guscio({
  idControllo,
  etichetta,
  errore,
  suggerimento,
  children,
}: {
  idControllo: string
  etichetta: string
  errore?: string
  suggerimento?: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={idControllo} className="text-xs font-bold uppercase text-black">
        {etichetta}
      </label>
      {children}
      {suggerimento && !errore && (
        <p className="text-[11px] font-semibold text-gray-500">{suggerimento}</p>
      )}
      {/* role="alert" fa annunciare l'errore appena compare, senza che
          l'utente debba tornare indietro a cercarlo. */}
      {errore && (
        <p id={`${idControllo}-errore`} role="alert" className="text-xs font-bold text-rose-700">
          {errore}
        </p>
      )}
    </div>
  )
}

type Extra = { etichetta: string; errore?: string; suggerimento?: string }

/**
 * Tutte le props non riconosciute finiscono sul controllo, quindi
 * `{...register('campo')}` di react-hook-form si spalma qui dentro senza
 * cerimonie: `ref` compresa, che in React 19 e' una prop normale.
 */
export function Campo({
  etichetta,
  errore,
  suggerimento,
  id,
  className,
  ...props
}: ComponentPropsWithRef<'input'> & Extra) {
  const generato = useId()
  const idc = id ?? generato
  return (
    <Guscio idControllo={idc} etichetta={etichetta} errore={errore} suggerimento={suggerimento}>
      <input
        id={idc}
        aria-invalid={errore ? true : undefined}
        aria-describedby={errore ? `${idc}-errore` : undefined}
        className={cn(stileControllo, className)}
        {...props}
      />
    </Guscio>
  )
}

export function CampoSelect({
  etichetta,
  errore,
  suggerimento,
  id,
  className,
  ...props
}: ComponentPropsWithRef<'select'> & Extra) {
  const generato = useId()
  const idc = id ?? generato
  return (
    <Guscio idControllo={idc} etichetta={etichetta} errore={errore} suggerimento={suggerimento}>
      <select
        id={idc}
        aria-invalid={errore ? true : undefined}
        aria-describedby={errore ? `${idc}-errore` : undefined}
        className={cn(stileControllo, 'cursor-pointer', className)}
        {...props}
      />
    </Guscio>
  )
}

export function CampoArea({
  etichetta,
  errore,
  suggerimento,
  id,
  className,
  ...props
}: ComponentPropsWithRef<'textarea'> & Extra) {
  const generato = useId()
  const idc = id ?? generato
  return (
    <Guscio idControllo={idc} etichetta={etichetta} errore={errore} suggerimento={suggerimento}>
      <textarea
        id={idc}
        aria-invalid={errore ? true : undefined}
        aria-describedby={errore ? `${idc}-errore` : undefined}
        className={cn(stileControllo, 'min-h-24 resize-y', className)}
        {...props}
      />
    </Guscio>
  )
}
