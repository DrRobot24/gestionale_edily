import type { Database } from '../../lib/database.types'
import { Badge } from '../../ui'

type CantiereStato = Database['public']['Enums']['cantiere_stato']

/**
 * Etichette e colori degli stati di un cantiere.
 *
 * Il Record e' tipizzato sull'enum del database: se domani aggiungi uno
 * stato in Postgres e rigeneri i tipi, TypeScript segnala qui che manca
 * l'etichetta, invece di lasciarti in produzione un badge vuoto.
 *
 * Il colore non e' decorazione, e' informazione: solo `attivo` e
 * `sospeso` sono colorati, perche' sono i due stati su cui qualcuno
 * deve fare qualcosa. Chiuso e archiviato restano neutri — se coloriamo
 * tutto, non risalta piu' niente.
 */
const STATI: Record<CantiereStato, { etichetta: string; colore: Parameters<typeof Badge>[0]['colore'] }> = {
  in_preparazione: { etichetta: 'In preparazione', colore: 'info' },
  attivo: { etichetta: 'Attivo', colore: 'successo' },
  sospeso: { etichetta: 'Sospeso', colore: 'attesa' },
  chiuso: { etichetta: 'Chiuso', colore: 'neutro' },
  archiviato: { etichetta: 'Archiviato', colore: 'neutro' },
}

export function StatoCantiere({ stato }: { stato: CantiereStato }) {
  const s = STATI[stato]
  return <Badge colore={s.colore}>{s.etichetta}</Badge>
}
