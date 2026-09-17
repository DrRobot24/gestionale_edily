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

/**
 * Si cancella quando si puo' ancora modificare, e per la stessa ragione.
 *
 * Chiesto dall'utente il 2026-09-17: «diamogli la possibilita' al tecnico
 * di poter eliminare un rapportino di un cantiere oltre che di poterlo
 * modificare prima dell'invio al titolare».
 *
 * La regola coincide con `modificabile()` e NON e' un caso: finche' il
 * foglio e' sulla scrivania di chi lo scrive, e' suo — puo' correggerlo
 * o buttarlo. Dal momento in cui parte diventa un documento consegnato,
 * e un documento consegnato non si fa sparire: se il titolare l'ha gia'
 * letto e respinto, la storia di quel respingimento e' informazione, non
 * ingombro. Da li' in poi la strada e' correggere e rimandare.
 *
 * Il `respinto` resta cancellabile ed e' voluto: e' tornato in mano
 * all'autore, e una scheda aperta per sbaglio sul cantiere sbagliato si
 * butta invece di trascinarsela.
 *
 * Volutamente una funzione a se' e non un alias: il giorno che le due
 * regole divergessero — per esempio "il respinto si corregge ma non si
 * cancella" — si cambia qui senza andare a cercare chi chiamava cosa.
 */
export function cancellabile(stato: RapportinoStato): boolean {
  return modificabile(stato)
}
