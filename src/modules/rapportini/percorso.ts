import type { Tappa } from '../../ui'

/* ══════════════════════════════════════════════════════════════════
   Da dove sei entrato in un rapportino, e come si torna indietro.

   `ritorno` viaggia nell'indirizzo per tutto il giro: chi apre una
   scheda da una card della home ci deve tornare, chi la apre dalla
   scheda di un cantiere pure. Senza, si finirebbe sempre nell'elenco
   generale dei rapportini, che e' un posto dove nessuno era.

   Sta in un file suo e non dentro il componente perche' un modulo che
   esporta insieme componenti e funzioni rompe il fast refresh di Vite:
   toccarlo ricarica la pagina invece di aggiornarla.
   ══════════════════════════════════════════════════════════════════ */

export function risali(ritorno: string | null): { etichetta: string; a: string } {
  if (ritorno === '/') return { etichetta: 'Home', a: '/' }
  if (ritorno?.startsWith('/cantieri/')) return { etichetta: 'Cantiere', a: ritorno }
  return { etichetta: 'Rapportini', a: ritorno ?? '/rapportini' }
}

/**
 * Il percorso fino alla scheda aperta. Cambia radice a seconda di dove
 * si e' entrati: dal cantiere si e' dentro una giornata di quel
 * cantiere, dall'elenco si e' dentro i rapportini.
 *
 * `coda` sono le tappe finali: il numero del foglio, ed eventualmente
 * "Modifica" quando si sta scrivendo invece di leggere.
 */
export function strada(ritorno: string | null, ...coda: Tappa[]): Tappa[] {
  if (ritorno?.startsWith('/cantieri/')) {
    return [{ etichetta: 'Cantieri' }, { etichetta: 'Giornata', a: ritorno }, ...coda]
  }
  return [{ etichetta: 'Rapportini', a: '/rapportini' }, ...coda]
}

/** "n. 12/2026", oppure una parola sola quando il numero non c'e'
 *  ancora: lo assegna il database al primo salvataggio. */
export function foglio(numero: number | null, anno: number | null): Tappa {
  return { etichetta: numero ? `n. ${numero}/${anno}` : 'Rapportino' }
}
