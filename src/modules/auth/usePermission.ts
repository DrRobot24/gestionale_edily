import { useSession } from './SessionProvider'
import type { Permission } from './session'

/**
 * usePermission('rapportini.validate') -> boolean
 *
 * Con piu' permessi la semantica e' AND: `usePermission('a','b')` e' vero
 * solo se li hai entrambi. E' la scelta piu' prudente: se ti serve OR lo
 * scrivi esplicito con due chiamate, cosi' chi legge il codice non deve
 * indovinare.
 */
export function usePermission(...permessi: Permission[]): boolean {
  const { can } = useSession()
  return permessi.every(can)
}

export function useRuolo() {
  const { org } = useSession()
  return org?.ruolo ?? null
}
