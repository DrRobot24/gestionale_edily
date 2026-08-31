import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useSession } from './SessionProvider'
import { Card } from '../../ui'
import type { Permission } from './session'

/**
 * Tre cancelli in fila, nell'ordine in cui il database li applica:
 *   1. sei autenticato?           -> altrimenti login
 *   2. appartieni a un'azienda?   -> altrimenti schermata dedicata
 *   3. hai il permesso?           -> altrimenti 403
 *
 * Il terzo cancello e' cortesia verso l'utente, non sicurezza: chi
 * bypassa il router trova comunque la RLS che gli restituisce zero righe.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { inCaricamento, authSession, orgs, errore } = useSession()
  const location = useLocation()

  if (inCaricamento) return <Schermo testo="Carico la sessione…" />

  if (!authSession) {
    return <Navigate to="/login" replace state={{ da: location.pathname }} />
  }

  if (errore) {
    return (
      <Schermo
        titolo="Non riesco a leggere il tuo profilo"
        testo={errore.message}
      />
    )
  }

  if (orgs.length === 0) {
    return (
      <Schermo
        titolo="Il tuo account non è ancora collegato a un'azienda"
        testo="Chiedi al titolare di invitarti dal pannello Utenti. Il tuo accesso alla WBS resta attivo."
      />
    )
  }

  return <>{children}</>
}

export function RequirePermission({
  perm,
  children,
}: {
  perm: Permission
  children: ReactNode
}) {
  const { can } = useSession()
  if (!can(perm)) {
    return (
      <Schermo
        titolo="Questa sezione non è nel tuo ruolo"
        testo="Se ti serve, chiedi al titolare di modificare i tuoi permessi."
      />
    )
  }
  return <>{children}</>
}

/**
 * Il cartello che compare al posto della pagina. Senza titolo (il caso
 * "sto caricando") resta volutamente anonimo: non e' un errore, non
 * merita una card che urla.
 */
function Schermo({ titolo, testo }: { titolo?: string; testo: string }) {
  if (!titolo) {
    return (
      <div className="grid min-h-[60vh] place-items-center p-6">
        <p className="text-sm font-bold text-gray-600">{testo}</p>
      </div>
    )
  }

  return (
    <div className="grid min-h-[60vh] place-items-center p-6">
      <Card className="max-w-md p-6 text-center">
        <h2 className="mb-2 text-lg font-extrabold text-black">{titolo}</h2>
        <p className="text-sm font-semibold leading-relaxed text-gray-600">{testo}</p>
      </Card>
    </div>
  )
}
