import { Link } from 'react-router'
import { cn } from './cn'

/* ══════════════════════════════════════════════════════════════════
   La riga che dice DOVE SEI e COME SI TORNA INDIETRO.

   Sta in cima a ogni pagina in cui si entra da qualche altra parte: la
   scheda di un cantiere, un rapportino, un modulo. Non serve sulle
   pagine di menu, dove a dire dove sei c'e' gia' la voce accesa nella
   barra laterale.

   Due pezzi, e sono due domande diverse:

     la freccia   dove porta il passo indietro, scritto com'e' quel
                  posto davvero. Prima qui c'era «Torna alla giornata»,
                  che era il nome di una sezione dentro la home e non il
                  nome della home: si tornava in un posto che non si
                  chiamava cosi'.
     il percorso  in che punto del programma ti trovi, dalla radice fino
                  a qui.

   La freccia e' un blocco ambra con bordo nero, non un link testuale.
   Un link piccolo grigio in cima alla pagina lo trova chi lo cerca; un
   bottone colorato lo vede chi non lo sta cercando, che e' proprio chi
   si e' perso.
   ══════════════════════════════════════════════════════════════════ */

export type Tappa = {
  etichetta: string
  /** Senza indirizzo la tappa non e' cliccabile: e' il posto dove sei
   *  adesso, oppure una sezione che non ha una pagina sua. */
  a?: string
}

type Props = {
  /** Il passo indietro: dove porta e come si chiama quel posto. */
  indietro: Tappa & { a: string }
  /** Il percorso fino a qui, radice esclusa. L'ultima tappa e' la
   *  pagina aperta e si scrive in nero. */
  qui: Tappa[]
  className?: string
}

export function Percorso({ indietro, qui, className }: Props) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2', className)}>
      <Link
        to={indietro.a}
        className="neo-press inline-flex items-center gap-1.5 rounded-xl border-2 border-black bg-amber-400 px-3 py-1.5 text-xs font-extrabold text-black shadow-neo-sm"
      >
        {/* aria-hidden perche' la freccia e' decorazione: chi usa uno
            screen reader sente gia' "collegamento: Home". */}
        <span aria-hidden="true">←</span>
        {indietro.etichetta}
      </Link>

      <nav aria-label="Percorso" className="flex min-w-0 flex-wrap items-center gap-1.5">
        {qui.map((tappa, i) => {
          const ultima = i === qui.length - 1
          return (
            <span key={`${tappa.etichetta}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && (
                <span aria-hidden="true" className="text-xs font-bold text-gray-400">
                  ›
                </span>
              )}
              {tappa.a && !ultima ? (
                <Link
                  to={tappa.a}
                  className="truncate text-[11px] font-bold uppercase tracking-wide text-gray-600 underline decoration-2 underline-offset-2 hover:text-black"
                >
                  {tappa.etichetta}
                </Link>
              ) : (
                <span
                  aria-current={ultima ? 'page' : undefined}
                  className={cn(
                    'truncate text-[11px] font-bold uppercase tracking-wide',
                    ultima ? 'text-black' : 'text-gray-600',
                  )}
                >
                  {tappa.etichetta}
                </span>
              )}
            </span>
          )
        })}
      </nav>
    </div>
  )
}
