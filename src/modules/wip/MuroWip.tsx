import type { ReactNode } from 'react'
import { useSession } from '../auth/SessionProvider'
import { env } from '../../lib/env'
import { LavoriInCorso } from './LavoriInCorso'

/**
 * Il muro davanti all'applicazione, in una riga sola di `.env`.
 *
 * Chi passa: solo le email in `VITE_WIP_EMAIL_AMMESSE`. Che vuol dire
 * fare prima il login — l'email si conosce solo dopo — e per questo la
 * rotta `/login` resta aperta anche col muro alzato: e' l'unica porta
 * da cui si entra, non un'eccezione dimenticata.
 *
 * Si aspetta la fine del caricamento della sessione prima di decidere:
 * altrimenti al ricaricare la pagina si vedrebbe un lampo di cartello
 * anche da autorizzati, perche' per un istante l'email non c'e' ancora.
 */
export function MuroWip({ children }: { children: ReactNode }) {
  const { inCaricamento, authSession } = useSession()

  if (!env.VITE_WIP) return <>{children}</>

  if (inCaricamento) {
    return (
      <div className="grid min-h-screen place-items-center bg-gray-900 p-6">
        <p className="text-sm font-bold text-gray-400">Un momento…</p>
      </div>
    )
  }

  const email = authSession?.user.email?.trim().toLowerCase()
  if (email && env.VITE_WIP_EMAIL_AMMESSE.has(email)) return <>{children}</>

  return <LavoriInCorso />
}
