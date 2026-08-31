import { Badge } from '../../ui'
import type { RapportinoStato } from './regole'

/**
 * Gli stati del rapportino, col colore che ne racconta il significato
 * operativo invece che l'ordine cronologico:
 *
 *   bozza          non ancora partito, nessuno lo aspetta   → neutro
 *   inviato        e' sul tavolo del titolare, si attende   → giallo
 *   respinto       torna indietro, c'e' da rifare           → rosso
 *   validato       accettato                                → verde
 *   contabilizzato entrato in contabilita', non si tocca    → azzurro
 *
 * Il Record e' chiuso sull'enum del database: aggiungere uno stato in
 * Postgres e rigenerare i tipi fa fallire la compilazione finche' non lo
 * si descrive anche qui. Meglio un errore in compilazione che un badge
 * vuoto in produzione.
 */
const STATI: Record<
  RapportinoStato,
  { etichetta: string; colore: Parameters<typeof Badge>[0]['colore'] }
> = {
  bozza: { etichetta: 'Bozza', colore: 'neutro' },
  inviato: { etichetta: 'Inviato', colore: 'attesa' },
  respinto: { etichetta: 'Respinto', colore: 'errore' },
  validato: { etichetta: 'Validato', colore: 'successo' },
  contabilizzato: { etichetta: 'Contabilizzato', colore: 'info' },
}

export function StatoRapportino({ stato }: { stato: RapportinoStato }) {
  const s = STATI[stato]
  return <Badge colore={s.colore}>{s.etichetta}</Badge>
}
