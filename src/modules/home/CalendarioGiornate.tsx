import { Card, cn } from '../../ui'
import { griglieDelMese, giornoPiu, meseEAnno } from '../../lib/formato'
import { useCantieri } from '../cantieri/useCantieri'
import { useRapportini, type Rapportino } from '../rapportini/useRapportini'
import { oggi } from '../rapportini/campiRapportino'

/* ══════════════════════════════════════════════════════════════════
   Il calendario da scrivania delle giornate.

   Ha preso il posto di «Giornate rimaste aperte», che elencava una card
   per giorno con dentro tutte le schede: corretto come informazione,
   ma era mezza schermata di righe da leggere per sapere una cosa che si
   guarda in un colpo d'occhio. L'utente l'ha detto cosi' il 2026-09-15:
   «questa e' una dashboard, non un elenco di uno schema di database».

   Quindi la stessa informazione cambia forma. Un mese, quaranta
   caselle, e il colore dice se quel giorno chiede qualcosa. I dettagli
   non sparicono: si aprono sotto, cliccando il giorno.

   I COLORI, e perche' sono questi tre:

     rosso   la giornata non e' completa: mancano schede, oppure il
             titolare ne ha rimandata indietro una. Chiede lavoro.
     giallo  le schede ci sono tutte e sono partite, ma il titolare non
             ha ancora firmato. Non chiede niente a te: sta aspettando
             lui.
     verde   tutte le schede di quel giorno sono validate (o
             contabilizzate). Chiuso.

   Un giorno senza nessuna scheda resta BIANCO e non rosso, ed e' una
   scelta: domenica, i festivi e i giorni in cui l'impresa non ha aperto
   non sono giornate da recuperare. Il rosso si accende quando qualcosa
   e' cominciato e non e' finito — che e' il caso vero da segnalare.

   ATTENZIONE al perimetro. Qui si guardano i rapportini che la RLS ha
   gia' filtrato: il tecnico vede quelli dei cantieri suoi. Il conteggio
   dei cantieri attivi e' quello di OGGI, non di quel giorno, quindi su
   un mese vecchio in cui i cantieri erano altri il conto e'
   approssimato. E' un'indicazione visiva, e il conto vero lo fa il
   database quando si prova a mandare la giornata — la stessa avvertenza
   che aveva «Giornate rimaste aperte».
   ══════════════════════════════════════════════════════════════════ */

/* Tipo e regola restano PRIVATI del file: nessuno li usa da fuori, e
   esportarli accanto a un componente rompe il fast refresh di Vite
   (`react-refresh/only-export-components`). Se un giorno la stessa
   regola servira' altrove — per esempio al titolare — va in un file
   suo, non esportata da qui. */
type StatoGiornata = 'vuota' | 'rosso' | 'giallo' | 'verde'

const ASPETTO: Record<Exclude<StatoGiornata, 'vuota'>, string> = {
  rosso: 'bg-rose-300',
  giallo: 'bg-yellow-300',
  verde: 'bg-lime-300',
}

const INIZIALI = ['L', 'M', 'M', 'G', 'V', 'S', 'D']

/**
 * Lo stato di una giornata, dalle schede di quel giorno.
 *
 * L'ordine dei controlli non e' casuale: prima cio' che chiede lavoro a
 * chi guarda, poi cio' che aspetta qualcun altro. Una giornata con una
 * scheda respinta e cinque validate e' rossa, perche' quella respinta e'
 * il fatto che conta.
 */
function statoGiornata(schede: Rapportino[], cantieriAttivi: number): StatoGiornata {
  if (schede.length === 0) return 'vuota'

  const respinte = schede.some((r) => r.stato === 'respinto')
  const inBozza = schede.some((r) => r.stato === 'bozza')
  if (respinte || inBozza || schede.length < cantieriAttivi) return 'rosso'

  // Tutte arrivate in fondo: il titolare ha firmato.
  const tutteChiuse = schede.every((r) => r.stato === 'validato' || r.stato === 'contabilizzato')
  return tutteChiuse ? 'verde' : 'giallo'
}

export function CalendarioGiornate({
  giorno,
  onScegli,
}: {
  giorno: string
  onScegli: (g: string) => void
}) {
  const { data: cantieri } = useCantieri()
  const { data: rapportini } = useRapportini()

  const attivi = (cantieri ?? []).filter((c) => c.stato === 'attivo').length

  const perGiorno = new Map<string, Rapportino[]>()
  for (const r of rapportini ?? []) {
    const gruppo = perGiorno.get(r.data)
    if (gruppo) gruppo.push(r)
    else perGiorno.set(r.data, [r])
  }

  const celle = griglieDelMese(giorno)
  const adesso = oggi()

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b-2 border-black bg-white px-4 py-2">
        <button
          type="button"
          aria-label="Mese precedente"
          onClick={() => onScegli(meseIndietro(giorno))}
          className="neo-press rounded-lg border-2 border-black bg-white px-2.5 py-1 text-xs font-extrabold"
        >
          ‹
        </button>

        <p className="text-sm font-extrabold capitalize text-black">{meseEAnno(giorno)}</p>

        {/* Il mese successivo si spegne quando siamo nel mese di oggi:
            oltre non c'e' niente da guardare, solo caselle spente. */}
        <button
          type="button"
          aria-label="Mese successivo"
          disabled={giorno.slice(0, 7) >= oggi().slice(0, 7)}
          onClick={() => onScegli(meseAvanti(giorno))}
          className="neo-press rounded-lg border-2 border-black bg-white px-2.5 py-1 text-xs font-extrabold disabled:cursor-not-allowed disabled:text-gray-300"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 p-3">
        {INIZIALI.map((i, k) => (
          <span
            key={`${i}-${k}`}
            className="pb-1 text-center text-[10px] font-extrabold uppercase text-gray-500"
          >
            {i}
          </span>
        ))}

        {celle.map((cella, k) => {
          if (!cella) return <span key={`vuota-${k}`} />

          const stato = statoGiornata(perGiorno.get(cella) ?? [], attivi)
          const scelto = cella === giorno
          const futuro = cella > adesso

          return (
            <button
              key={cella}
              type="button"
              disabled={futuro}
              onClick={() => onScegli(cella)}
              aria-current={scelto ? 'date' : undefined}
              title={descrizione(stato)}
              className={cn(
                'relative aspect-square rounded-lg border-2 text-xs font-bold',
                stato === 'vuota' ? 'bg-white' : ASPETTO[stato],
                scelto ? 'border-black ring-2 ring-black ring-offset-1' : 'border-black/30',
                futuro
                  ? 'cursor-not-allowed text-gray-300'
                  : 'neo-press cursor-pointer text-black hover:border-black',
              )}
            >
              {Number(cella.slice(8, 10))}
              {/* Oggi si riconosce anche quando stai guardando un altro
                  giorno: senza, sfogliando indietro si perde il punto
                  di partenza. */}
              {cella === adesso && (
                <span className="absolute inset-x-0 bottom-0.5 text-[8px] font-extrabold uppercase">
                  oggi
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t-2 border-black bg-gray-50 px-4 py-2">
        <Legenda colore="bg-rose-300" testo="da chiudere" />
        <Legenda colore="bg-yellow-300" testo="dal titolare" />
        <Legenda colore="bg-lime-300" testo="validata" />
      </div>
    </Card>
  )
}

function Legenda({ colore, testo }: { colore: string; testo: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('h-3 w-3 rounded border-2 border-black', colore)} />
      <span className="text-[10px] font-bold uppercase tracking-wide text-gray-600">{testo}</span>
    </span>
  )
}

function descrizione(stato: StatoGiornata): string {
  if (stato === 'rosso') return 'Giornata da chiudere'
  if (stato === 'giallo') return 'Inviata, in attesa del titolare'
  if (stato === 'verde') return 'Validata dal titolare'
  return 'Nessuna scheda'
}

/* Il salto di mese passa per il primo del mese, non per il giorno in
   cui ti trovi: da «31 marzo indietro di un mese» non esiste il 31
   febbraio, e la data scivolerebbe. Un giorno prima del primo di questo
   mese e' l'ultimo del mese scorso; un giorno dopo l'ultimo di questo
   e' il primo del prossimo. */
const primoDelMese = (g: string) => `${g.slice(0, 7)}-01`

function meseIndietro(g: string): string {
  return primoDelMese(giornoPiu(primoDelMese(g), -1))
}

function meseAvanti(g: string): string {
  // +31 da un primo del mese cade sempre nel mese successivo, mai oltre:
  // nessun mese ha piu' di 31 giorni.
  return primoDelMese(giornoPiu(primoDelMese(g), 31))
}
