import { twMerge } from 'tailwind-merge'

/**
 * Unisce classi Tailwind risolvendo i conflitti a favore dell'ultima.
 *
 * Serve davvero, non e' zucchero: in CSS a vincere fra due classi in
 * conflitto e' quella che sta piu' in basso nel FOGLIO DI STILE, non
 * quella scritta per ultima nell'attributo class. Quindi
 *
 *   <Button className="px-2" />   // Button dentro ha gia' px-5
 *
 * senza twMerge da' un risultato che dipende dall'ordine con cui
 * Tailwind ha generato il CSS: a volte px-2, a volte px-5. Con twMerge
 * px-5 viene proprio rimossa dalla stringa e px-2 vince sempre.
 *
 * E' il motivo per cui ogni componente qui sotto mette `className` per
 * ULTIMO: chi usa il componente deve poter sovrascrivere.
 */
export function cn(...classi: Array<string | false | null | undefined>): string {
  return twMerge(classi.filter(Boolean).join(' '))
}
