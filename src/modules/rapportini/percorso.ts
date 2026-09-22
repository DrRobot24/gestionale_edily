import type { Tappa } from '../../ui'

/* ══════════════════════════════════════════════════════════════════
   Dove torna il passo indietro di un rapportino, e che strada racconta.

   UN RAPPORTINO E' SEMPRE LA GIORNATA DI UN CANTIERE. Non esiste un
   rapportino che non sia di un cantiere, quindi il passo indietro non
   e' mai un'opinione: e' la scheda di quel cantiere, aperta sul giorno
   del foglio che si stava leggendo.

   Prima dipendeva da `ritorno`, un parametro nell'indirizzo che diceva
   da dove eri entrato. Reggeva finche' chi apriva il rapportino si
   ricordava di scriverlo, e meta' dei posti da cui si apre non lo
   scrivevano: dal calendario del cantiere, dalla dashboard, dal
   controllo ore, dall'elenco. Da li' la freccia diceva «Rapportini» e
   ti scaricava nell'elenco generale — un posto dove non eri mai stato,
   e da cui il cantiere che stavi guardando non si ritrova piu'.
   Segnalato dall'utente il 2026-09-22: «mi sento come Tom Hanks in
   mezzo all'oceano».

   Adesso la destinazione la decide il DATO, non l'indirizzo: il
   rapportino sa il suo `cantiere_id` e la sua `data`, e tanto basta.
   `ritorno` resta solo per il caso in cui non si sappia ancora di che
   cantiere si parla — la scheda nuova, prima che venga scelto.

   Sta in un file suo e non dentro il componente perche' un modulo che
   esporta insieme componenti e funzioni rompe il fast refresh di Vite:
   toccarlo ricarica la pagina invece di aggiornarla.
   ══════════════════════════════════════════════════════════════════ */

/** Il cantiere a cui appartiene il foglio: quel tanto che serve per
 *  tornarci e per scriverne il nome sulla freccia. */
export type Appartenenza = {
  cantiereId: string
  /** Il giorno del rapportino: la scheda del cantiere si riapre li',
   *  non su oggi. Chi stava guardando il 18 settembre ci resta. */
  data: string
  codice?: string | null
  denominazione?: string | null
}

/** L'indirizzo della scheda del cantiere, sul giorno giusto. */
export function versoCantiere(dove: Appartenenza): string {
  return `/cantieri/${dove.cantiereId}?data=${dove.data}`
}

/** Come si chiama quel cantiere sulla freccia. Il codice e' corto e sta
 *  in una riga; se manca resta la parola generica, che e' sempre meglio
 *  di un'etichetta vuota. */
function nomeCantiere(dove: Appartenenza): string {
  return dove.codice?.trim() || dove.denominazione?.trim() || 'Cantiere'
}

/**
 * Il passo indietro da dentro un rapportino.
 *
 * Con l'appartenenza nota — cioe' sempre, tranne su una scheda nuova
 * ancora senza cantiere — si torna alla scheda del cantiere. Senza, si
 * ripiega su `ritorno`, e in ultima istanza sull'elenco.
 */
export function risali(
  dove: Appartenenza | null | undefined,
  ritorno?: string | null,
): { etichetta: string; a: string } {
  if (dove) return { etichetta: nomeCantiere(dove), a: versoCantiere(dove) }
  if (ritorno === '/') return { etichetta: 'Home', a: '/' }
  if (ritorno?.startsWith('/cantieri/')) return { etichetta: 'Cantiere', a: ritorno }
  return { etichetta: 'Rapportini', a: ritorno ?? '/rapportini' }
}

/**
 * Il percorso fino alla scheda aperta, dalla radice a qui.
 *
 * Con l'appartenenza nota e' sempre lo stesso, perche' la gerarchia
 * vera e' sempre quella: Cantieri › il cantiere › la giornata › il
 * foglio. Il nome del cantiere non si ripete sulla freccia perche' la
 * freccia e' il gesto e il percorso e' il posto — ma qui il posto ha
 * un livello in piu' (la giornata) che la freccia non copre, quindi la
 * tappa del cantiere ci sta e non e' un doppione fastidioso: la freccia
 * dice il codice, il percorso lo ripete come radice del cammino.
 *
 * `coda` sono le tappe finali: il numero del foglio, ed eventualmente
 * "Modifica" quando si sta scrivendo invece di leggere.
 */
export function strada(
  dove: Appartenenza | null | undefined,
  ...coda: Tappa[]
): Tappa[] {
  if (dove) {
    return [
      { etichetta: 'Cantieri' },
      { etichetta: nomeCantiere(dove), a: `/cantieri/${dove.cantiereId}` },
      { etichetta: 'Giornata', a: versoCantiere(dove) },
      ...coda,
    ]
  }
  return [{ etichetta: 'Rapportini', a: '/rapportini' }, ...coda]
}

/** "n. 12/2026", oppure una parola sola quando il numero non c'e'
 *  ancora: lo assegna il database al primo salvataggio. */
export function foglio(numero: number | null, anno: number | null): Tappa {
  return { etichetta: numero ? `n. ${numero}/${anno}` : 'Rapportino' }
}
