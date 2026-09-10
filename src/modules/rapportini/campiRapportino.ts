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

/** Le ore di una giornata piena in Italia. E' il metro del controllo
 *  sulle ore: sopra c'e' straordinario, sotto ci vuole un motivo. */
export const ORE_STANDARD = 8

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
  /** Resta nel modello anche se il form la tiene nascosta: alla Edily la
   *  squadra lavora quasi sempre in sede, ma il giorno che si sposta
   *  davvero l'ora di trasferta va scritta, e a stipendio si paga. */
  ore_trasferta: z.coerce.number().min(0, 'Mai negativo').max(24, 'Al massimo 24'),
  /** Quante ore della giornata copre il motivo scelto in `tipo_assenza`.
   *  Esiste perche' un permesso di due ore in mezzo a una giornata
   *  lavorata prima non si poteva scrivere: si era o presenti con le
   *  ore, o assenti con zero ore. Ed e' proprio quel caso che rende
   *  rispondibile la domanda del controllo, «perche' meno di otto». */
  ore_assenza: z.coerce.number().min(0, 'Mai negativo').max(24, 'Al massimo 24'),
  tipo_assenza: z.string(),
})
  // Ore di assenza senza un motivo sono ore sparite: il controllo le
  // conterebbe come coperte senza sapere da cosa.
  .refine((r) => r.ore_assenza === 0 || r.tipo_assenza !== '', {
    message: 'Scegli il motivo dell’assenza',
    path: ['tipo_assenza'],
  })

export const schemaRapportino = z
  .object({
    cantiere_id: z.string().min(1, 'Scegli il cantiere'),
    data: z.string().min(1, 'Serve la data'),
    /** Il tecnico ha aperto la scheda e ha dichiarato che qui, quel
     *  giorno, non si e' lavorato. E' una scelta, non una dimenticanza:
     *  serve perche' la giornata si chiude solo con TUTTE le schede
     *  compilate, compresi i cantieri fermi. */
    nessuna_attivita: z.boolean(),
    ora_inizio: z.string(),
    ora_fine: z.string(),
    /** Nel database la colonna si chiama `note` — non la rinominiamo,
     *  perche' il database e' condiviso con wbs-office. Nel form si legge
     *  "Descrizione attivita'": e' quello che il tecnico ci scrive, ed e'
     *  la parte che il titolare legge davvero. */
    note: z.string(),
    /** Il taccuino: quello che il tecnico vuole DIRE al titolare e che
     *  non e' lavoro svolto. Sta in una colonna sua perche' la
     *  descrizione e' un documento e questa e' un messaggio: mescolarli
     *  vuol dire non poter piu' stampare la prima senza la seconda. */
    annotazioni: z.string(),
    ore: z.array(rigaOre),
  })
  // Un orario di fine precedente all'inizio non e' un refuso innocuo:
  // finisce nel calcolo del costo manodopera.
  .refine((v) => !v.ora_inizio || !v.ora_fine || v.ora_fine > v.ora_inizio, {
    message: 'La fine deve venire dopo l’inizio',
    path: ['ora_fine'],
  })
  // Senza attivita' non ci sono presenti da segnare, ed e' il punto:
  // prima questa regola rendeva impossibile chiudere la scheda di un
  // cantiere fermo, e il tecnico doveva inventare una presenza o
  // lasciare la giornata a meta'.
  .refine((v) => v.nessuna_attivita || v.ore.some((o) => o.presente), {
    message: 'Aggiungi almeno una persona, oppure dichiara che non c’è stata attività',
    path: ['ore'],
  })
  // Il database rifiuta una scheda marcata "nessuna attivita" che abbia
  // righe di ore. Meglio dirlo qui che farsi rimbalzare dal trigger.
  .refine((v) => !v.nessuna_attivita || !v.ore.some((o) => o.presente), {
    message: 'Hai dichiarato nessuna attività: togli le presenze segnate',
    path: ['ore'],
  })

export type CampiRapportino = z.infer<typeof schemaRapportino>
export type RigaOre = CampiRapportino['ore'][number]

export const oggi = () => new Date().toLocaleDateString('sv-SE') // sv-SE = YYYY-MM-DD locale
