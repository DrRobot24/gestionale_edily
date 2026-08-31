import { z } from 'zod'

/* ══════════════════════════════════════════════════════════════════
   I campi del rapportino, definiti una volta per il form "nuovo" e per
   quello di modifica. Due schemi separati divergono al primo campo
   aggiunto, e divergono in silenzio.
   ══════════════════════════════════════════════════════════════════ */

/**
 * Nel database `tipo_assenza` e' testo libero. Finche' resta cosi',
 * "ferie" / "Ferie" / "ferie " diventano tre categorie e le paghe
 * sbagliano IN SILENZIO. Questa lista chiusa e' il tappo lato
 * applicazione: non e' un vincolo vero — lo sara' quando diventera' un
 * enum in Postgres — ma impedisce che i dati sporchi entrino da qui.
 */
export const ASSENZE = ['Ferie', 'Permesso', 'Malattia', 'Infortunio', 'Congedo'] as const

export const METEO = ['Sereno', 'Nuvoloso', 'Pioggia', 'Vento forte', 'Neve', 'Nebbia']

const rigaOre = z.object({
  /** Vuoto per una riga nuova, valorizzato per una che esiste gia' nel
   *  database: e' quel che permette alla modifica di distinguere fra
   *  inserire, aggiornare e cancellare. */
  rigaId: z.string(),
  dipendente_id: z.string(),
  nominativo: z.string(),
  presente: z.boolean(),
  ore_ordinarie: z.coerce.number().min(0, 'Mai negativo').max(24, 'Al massimo 24'),
  ore_straordinarie: z.coerce.number().min(0, 'Mai negativo').max(24, 'Al massimo 24'),
  ore_trasferta: z.coerce.number().min(0, 'Mai negativo').max(24, 'Al massimo 24'),
  tipo_assenza: z.string(),
})

export const schemaRapportino = z
  .object({
    cantiere_id: z.string().min(1, 'Scegli il cantiere'),
    data: z.string().min(1, 'Serve la data'),
    ora_inizio: z.string(),
    ora_fine: z.string(),
    meteo: z.string(),
    note: z.string(),
    ore: z.array(rigaOre),
  })
  // Un orario di fine precedente all'inizio non e' un refuso innocuo:
  // finisce nel calcolo del costo manodopera.
  .refine((v) => !v.ora_inizio || !v.ora_fine || v.ora_fine > v.ora_inizio, {
    message: 'La fine deve venire dopo l’inizio',
    path: ['ora_fine'],
  })
  .refine((v) => v.ore.some((o) => o.presente), {
    message: 'Segna almeno una persona presente',
    path: ['ore'],
  })

export type CampiRapportino = z.infer<typeof schemaRapportino>
export type RigaOre = CampiRapportino['ore'][number]

export const oggi = () => new Date().toLocaleDateString('sv-SE') // sv-SE = YYYY-MM-DD locale
