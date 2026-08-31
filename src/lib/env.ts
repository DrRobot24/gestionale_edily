import { z } from 'zod'

/**
 * Le variabili VITE_* finiscono nel bundle: sono PUBBLICHE.
 * Va bene solo perche' la anon key non da' privilegi: e' la RLS che
 * decide cosa quell'utente puo' leggere. Non metterci mai la service_role.
 *
 * Validiamo al boot invece che al primo uso: meglio una schermata bianca
 * con un errore chiaro in console che un "supabaseUrl is required" che
 * salta fuori dopo tre click.
 */
const schema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(20),
  VITE_APP_NAME: z.string().default('ENCREADE Gestionale'),
})

const parsed = schema.safeParse(import.meta.env)

if (!parsed.success) {
  const dettagli = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n')
  throw new Error(
    `Configurazione mancante o non valida nel file .env:\n${dettagli}\n` +
      `Copia .env.example in .env e riempi i valori dal pannello Supabase (Settings > API).`,
  )
}

export const env = parsed.data
