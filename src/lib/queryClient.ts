import { QueryClient } from '@tanstack/react-query'

/**
 * Regola: non riprovare su errori che non cambieranno riprovando.
 *
 * PostgREST risponde 401/403 quando la RLS nega la riga, e con codici
 * PGRST/42501 quando la policy blocca una scrittura. Riprovare tre volte
 * un permesso negato serve solo a triplicare il tempo prima di mostrare
 * il messaggio all'utente.
 */
function isPermanente(error: unknown): boolean {
  const e = error as { status?: number; code?: string }
  if (typeof e?.status === 'number' && e.status >= 400 && e.status < 500) return true
  if (typeof e?.code === 'string' && (e.code.startsWith('PGRST') || e.code === '42501')) return true
  return false
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (tentativi, error) => !isPermanente(error) && tentativi < 2,
    },
    mutations: {
      retry: false, // una POST riprovata in automatico e' un doppio rapportino
    },
  },
})
