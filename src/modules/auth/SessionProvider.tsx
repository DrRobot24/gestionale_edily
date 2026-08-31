import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { fetchAppSession, type AppSession, type Organizzazione, type Permission } from './session'

const CHIAVE_ORG = 'encreade.orgAttiva'

type ValoreSessione = {
  /** true finche' non sappiamo se c'e' una sessione. Serve a non far
   *  lampeggiare la pagina di login a chi e' gia' loggato. */
  inCaricamento: boolean
  authSession: Session | null
  app: AppSession | null
  errore: Error | null
  org: Organizzazione | null
  orgs: Organizzazione[]
  setOrgAttiva: (orgId: string) => void
  can: (perm: Permission) => boolean
  logout: () => Promise<void>
}

const SessionContext = createContext<ValoreSessione | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [authSession, setAuthSession] = useState<Session | null>(null)
  const [authPronta, setAuthPronta] = useState(false)
  const [orgIdScelta, setOrgIdScelta] = useState<string | null>(
    () => localStorage.getItem(CHIAVE_ORG),
  )

  useEffect(() => {
    // getSession legge il token gia' salvato: e' sincrono sul localStorage,
    // ma restituisce una Promise perche' puo' dover rinfrescare il token.
    supabase.auth.getSession().then(({ data }) => {
      setAuthSession(data.session)
      setAuthPronta(true)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((evento, sessione) => {
      setAuthSession(sessione)
      if (evento === 'SIGNED_OUT') {
        // Senza questo, il prossimo utente che entra su questo browser
        // vede per un istante i dati in cache del precedente.
        qc.clear()
        localStorage.removeItem(CHIAVE_ORG)
        setOrgIdScelta(null)
      }
    })

    return () => sub.subscription.unsubscribe()
  }, [qc])

  const userId = authSession?.user.id ?? null
  const email = authSession?.user.email ?? null

  const query = useQuery({
    queryKey: ['app-session', userId],
    queryFn: () => fetchAppSession(userId!, email),
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
  })

  const app = query.data ?? null
  const orgs = app?.orgs ?? []

  // L'organizzazione scelta va sempre riverificata contro la lista reale:
  // se ti hanno tolto dall'azienda, il localStorage non lo sa.
  const org = useMemo(() => {
    if (orgs.length === 0) return null
    return orgs.find((o) => o.id === orgIdScelta) ?? orgs[0]
  }, [orgs, orgIdScelta])

  const valore: ValoreSessione = {
    inCaricamento: !authPronta || (Boolean(userId) && query.isPending),
    authSession,
    app,
    errore: (query.error as Error) ?? null,
    org,
    orgs,
    setOrgAttiva: (orgId) => {
      localStorage.setItem(CHIAVE_ORG, orgId)
      setOrgIdScelta(orgId)
      // Cambiare azienda cambia il significato di ogni dato in cache.
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'app-session' })
    },
    can: (perm) => org?.permessi.has(perm) ?? false,
    logout: async () => {
      await supabase.auth.signOut()
    },
  }

  return <SessionContext.Provider value={valore}>{children}</SessionContext.Provider>
}

export function useSession(): ValoreSessione {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession va usato dentro <SessionProvider>')
  return ctx
}
