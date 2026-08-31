import type { Database } from '../../lib/database.types'

export type RapportinoStato = Database['public']['Enums']['rapportino_stato']

/**
 * Un rapportino si modifica solo in `bozza` o in `respinto`.
 *
 * Attenzione: oggi la policy di UPDATE lascerebbe modificare anche in
 * `inviato`. E' un buco noto — significa che il titolare potrebbe
 * validare un documento diverso da quello che ha letto. L'interfaccia si
 * comporta fin da subito come se fosse gia' chiuso, cosi' il giorno che
 * la policy viene corretta qui non cambia niente.
 *
 * Il trigger del database, invece, le transizioni le controlla davvero:
 * `inviato -> bozza` risponde P0001 "Transizione di stato non ammessa".
 * Le uniche vie verificate sul database sono:
 *
 *   bozza -> inviato -> respinto -> bozza -> ...
 *                    -> validato
 *
 * Sta in un file suo e non in stato.tsx perche' un modulo che esporta
 * insieme componenti e funzioni rompe il fast refresh di Vite: toccarlo
 * ricarica la pagina invece di aggiornarla, e in sviluppo perdi lo stato
 * del form che stavi compilando.
 */
export function modificabile(stato: RapportinoStato): boolean {
  return stato === 'bozza' || stato === 'respinto'
}

/** Chi puo' ancora agire su un rapportino inviato e' solo chi valida. */
export function inAttesaDiValidazione(stato: RapportinoStato): boolean {
  return stato === 'inviato'
}
