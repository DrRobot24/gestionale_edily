import { createClient } from '@supabase/supabase-js'
import { env } from './env'
import type { Database } from './database.types'

/**
 * Un solo client per tutta l'app, creato a livello di modulo.
 *
 * Perche' non dentro un componente o un context: createClient() apre un
 * canale di refresh del token e un listener. Se lo ricrei a ogni render
 * ti ritrovi con N client che si rinfrescano il token a vicenda e ogni
 * tanto se lo invalidano fra loro. E' un classico.
 *
 * storageKey: DEVE essere identica a quella di wbs-office se vuoi che
 * chi e' loggato su una app sia loggato anche sull'altra. Il localStorage
 * pero' e' per-origine: la sessione e' condivisa solo se le due app
 * stanno sullo stesso dominio (es. /wbs e /gestionale sullo stesso host,
 * oppure entrambe sotto app.encreade.it). Su due sottodomini diversi
 * (wbs.encreade.it e gestionale.encreade.it) il localStorage NON e'
 * condiviso e serve passare a storage su cookie con domain=.encreade.it.
 */
export const supabase = createClient<Database>(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: 'encreade-auth', // <-- allinea questo valore a wbs-office
    },
    global: {
      headers: { 'x-client-info': 'encreade-gestionale' },
    },
  },
)
