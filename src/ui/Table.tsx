import type { HTMLAttributes, TableHTMLAttributes, TdHTMLAttributes } from 'react'
import { cn } from './cn'

/**
 * Tabella dati in stile neo-brutalismo operativo.
 *
 * Bordo spesso e ombra stanno sul CONTENITORE, mai sulle celle: e' la
 * scelta che wbs-office aveva gia' trovato in CostiManagement, ed e'
 * l'unica che regge quaranta righe. Un bordo da 2px su ogni cella si
 * mangia lo spazio e i numeri smettono di leggersi.
 *
 * Gli stili delle celle sono applicati per discendenza con le varianti
 * arbitrarie di Tailwind, cosi' chi la usa scrive <thead>/<tr>/<td>
 * normali invece di importare sei componenti. Meno API da ricordare,
 * markup che resta HTML semantico.
 *
 * Il contenitore scorre in orizzontale per conto suo: una tabella larga
 * non deve mai far scorrere la PAGINA, o su telefono si perde la barra
 * di navigazione.
 */
export function Table({
  className,
  ...props
}: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-xl border-2 border-black bg-white shadow-neo">
      <table
        className={cn(
          'w-full border-collapse text-xs',
          // intestazione
          '[&_thead_tr]:border-b-2 [&_thead_tr]:border-black [&_thead_tr]:bg-gray-100',
          '[&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wider',
          // corpo
          '[&_tbody_tr]:border-b [&_tbody_tr]:border-gray-200',
          '[&_tbody_tr:last-child]:border-b-0',
          '[&_td]:px-3 [&_td]:py-2 [&_td]:align-middle',
          className,
        )}
        {...props}
      />
    </div>
  )
}

/**
 * Cella di un importo o di una quantita'.
 *
 * Allineata a destra e in cifre tabellari: senza `numerico` le cifre
 * hanno larghezze diverse, le colonne di euro non si incolonnano e due
 * importi non si confrontano a occhio. In un gestionale dove il cuore e'
 * il preventivo contro il consuntivo, e' la differenza fra una tabella
 * che si legge e una che si decifra.
 */
export function Cifra({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('numerico text-right font-bold', className)} {...props} />
}

/** Riga di totali: bordo nero sopra, come in wbs-office. */
export function RigaTotale({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('border-t-2 border-black bg-gray-50 font-bold', className)} {...props} />
}

/** Messaggio al posto della tabella quando non c'e' niente da mostrare.
 *  Una tabella vuota con le sole intestazioni sembra un errore. */
export function Vuoto({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-gray-400 bg-white p-8 text-center">
      <p className="text-sm font-semibold text-gray-600">{children}</p>
    </div>
  )
}
