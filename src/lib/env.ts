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
/** In `.env` i booleani sono stringhe: qui `true` (in qualunque
 *  combinazione di maiuscole) vale acceso, tutto il resto — variabile
 *  assente compresa — vale spento. Di proposito: se un domani la riga
 *  sparisce o si scrive male, si sbaglia verso l'app APERTA, non verso
 *  un muro che nessuno sa da dove arriva. */
const booleano = z
  .string()
  .optional()
  .transform((v) => v?.trim().toLowerCase() === 'true')

/** Un elenco di email separate da virgola diventa un insieme in
 *  minuscolo, cosi' il confronto non dipende da come uno le ha scritte. */
const listaEmail = z
  .string()
  .optional()
  .transform((v) =>
    new Set(
      (v ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  )

const schema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(20),
  VITE_APP_NAME: z.string().default('ENCREADE Gestionale'),

  /* Il muro "Lavori in corso". Acceso, chiunque apra l'indirizzo trova
     il cartello e nient'altro; passano solo le email elencate qui
     sotto. Serve a non far vedere ai clienti le novita' prima che siano
     pronte, e si spegne rimettendo `false`.

     ATTENZIONE a cosa NON e' questo interruttore: non e' sicurezza. Il
     valore finisce nel bundle come ogni VITE_*, e chi sa leggere il
     JavaScript puo' aggirare la schermata. Cio' che protegge davvero i
     dati resta la RLS: superato il cartello si trova comunque solo cio'
     che quell'utente poteva gia' leggere. E' una tenda, non una porta
     blindata. */
  VITE_WIP: booleano,
  VITE_WIP_EMAIL_AMMESSE: listaEmail,
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
