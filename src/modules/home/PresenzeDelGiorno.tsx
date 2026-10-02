import { useNavigate } from 'react-router'
import { Button, Card, cn } from '../../ui'
import { useCalendario } from '../calendario/calendario'
import {
  funzioneMancante,
  inGriglia,
  lavorate,
  ore,
  useGiornateInSospeso,
  useOreGriglia,
  type OreGiorno,
  type Periodo,
} from '../ore/useOrePeriodo'

/* ══════════════════════════════════════════════════════════════════
   CHI C'ERA — la colonna di un giorno del foglio presenze, in home a
   chi fa le paghe. Dal 2026-09-28.

   Nasce dalla home di Stefania, che l'utente ha trovato «molto scarna»:
   un saluto senza frecce, i registri e — quando c'era — il riquadro
   delle ore arrivate. Tutto il resto del gestionale sfoglia i giorni
   dalla fascia in alto; la sua home no, perche' non c'era niente sotto
   che dipendesse dal giorno.

   Il foglio presenze `/ore` si legge in due direzioni: per riga quanto
   ha fatto una persona, per COLONNA chi c'era quel giorno. Questo e' la
   colonna, e le frecce della fascia la spostano. Stessa fonte
   (`ore_griglia`), stesse regole: solo giornate firmate dal titolare, e
   tutti quelli in forza anche a zero — una riga vuota e' una domanda.

   IL TONO E' NEUTRO, sempre. Una persona senza ore quel giorno non e'
   un errore di nessuno finche' la giornata non e' firmata tutta: le sue
   ore possono essere ancora per strada. Quindi niente rosso, e sabato e
   domenica e nei festivi non si chiede niente — si mostra solo chi ha
   lavorato.
   ══════════════════════════════════════════════════════════════════ */

export function PresenzeDelGiorno({ giorno }: { giorno: string }) {
  const navigate = useNavigate()
  const cal = useCalendario()
  const periodo: Periodo = { passo: 'settimana', dal: giorno, al: giorno }

  const griglia = useOreGriglia(periodo)
  const sospeso = useGiornateInSospeso(periodo)

  const errore = (griglia.error ?? sospeso.error) as Error | null
  // Lo schema non eseguito si tace in home, come in `OreArrivate`.
  if (errore && funzioneMancante(errore)) return null

  const festivo = !cal.lavorabile(giorno)
  const persone = inGriglia(griglia.data ?? []).map((r) => ({
    ...r,
    casella: r.giorni.get(giorno),
  }))
  const inAttesa = (sospeso.data ?? []).length > 0

  const presenti = persone.filter((p) => p.casella && lavorate(p.casella) > 0)
  const assenti = persone.filter((p) => p.casella && lavorate(p.casella) === 0)
  const vuoti = persone.filter((p) => !p.casella)
  const totale = presenti.reduce((t, p) => t + lavorate(p.casella!), 0)

  /* Nel fine settimana si elenca solo chi ha lavorato davvero: gli
     altri non devono niente, e una lista di trattini direbbe il
     contrario. */
  const righe = festivo ? presenti : [...presenti, ...assenti, ...vuoti]

  const pronto = !errore && !griglia.isPending && !sospeso.isPending

  /* COMPATTO, dal 2026-09-28 stesso: «compattalo un po' di piu'».
     Intestazione e numeri del giorno in una fascia sola, e una persona
     per riga — nome, dove, ore — su due colonne dove c'e' spazio. */
  return (
    <Card className="overflow-hidden">
      <div
        className={cn(
          'flex flex-wrap items-center gap-x-5 gap-y-2 border-b-2 border-black px-4 py-2',
          inAttesa ? 'bg-yellow-200' : 'bg-sky-200',
        )}
      >
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-black">
          Chi c&rsquo;era
        </h2>
        {pronto && (
          <>
            <Numero valore={ore(totale)} etichetta="ore" />
            <Numero valore={String(presenti.length)} etichetta="al lavoro" />
            {!festivo && assenti.length > 0 && (
              <Numero valore={String(assenti.length)} etichetta="assenti" />
            )}
          </>
        )}
        <Button
          dimensione="sm"
          variante="secondario"
          className="ml-auto"
          onClick={() => navigate('/ore')}
        >
          Foglio presenze
        </Button>
      </div>

      {/* Il foglio non e' completo finche' il titolare non ha firmato
          tutto: dirlo, senza dire di chi. */}
      {pronto && inAttesa && (
        <p className="border-b-2 border-black bg-yellow-50 px-4 py-1.5 text-[11px] font-bold text-black">
          Giornata non ancora firmata tutta: le ore compaiono quando il titolare le valida.
        </p>
      )}

      {errore && (
        <p className="px-4 py-3 text-sm font-semibold text-rose-700">
          Non riesco a leggere le ore del giorno: {errore.message}
        </p>
      )}

      {!errore && !pronto && (
        <p className="px-4 py-3 text-sm font-bold text-gray-600">Carico le presenze…</p>
      )}

      {pronto &&
        (righe.length === 0 ? (
          <p className="px-4 py-3 text-sm font-semibold text-gray-600">
            {festivo ? 'Giorno festivo: nessuno ha lavorato.' : 'Nessuna risorsa in servizio.'}
          </p>
        ) : (
          <ul className="grid sm:grid-cols-2 sm:gap-x-6 px-4 py-1">
            {righe.map((p) => (
              <RigaPersona key={p.dipendente_id} nominativo={p.nominativo} casella={p.casella} />
            ))}
          </ul>
        ))}
    </Card>
  )
}

function Numero({ valore, etichetta }: { valore: string; etichetta: string }) {
  return (
    <p className="flex items-baseline gap-1">
      <span className="numerico text-lg font-black leading-none text-black">{valore}</span>
      <span className="text-[11px] font-bold uppercase tracking-wide text-black/70">
        {etichetta}
      </span>
    </p>
  )
}

/** Una persona in quel giorno: dove ha lavorato e quante ore, oppure il
 *  motivo dell'assenza, oppure niente — detto in grigio. */
function RigaPersona({ nominativo, casella }: { nominativo: string; casella?: OreGiorno }) {
  const lavorato = casella ? lavorate(casella) : 0
  const straord = casella ? Number(casella.ore_straordinarie) : 0

  let dettaglio: string
  if (!casella) dettaglio = 'nessuna ora firmata'
  else if (lavorato === 0) {
    const motivo = casella.tipo_assenza ?? 'assente'
    dettaglio = casella.nota_assenza ? `${motivo} — ${casella.nota_assenza}` : motivo
  } else if (casella.cantieri.length > 0) {
    dettaglio = casella.cantieri.map((c) => c.codice ?? c.denominazione ?? 'cantiere').join(' · ')
  } else dettaglio = 'foglio ore personale' // tecnico e impiegati: nessun cantiere

  return (
    <li className="flex items-baseline gap-2 border-b border-black/10 py-1.5 text-sm">
      <span className="shrink-0 font-extrabold text-black">{nominativo}</span>
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-xs font-semibold first-letter:uppercase',
          !casella ? 'text-gray-400' : lavorato === 0 ? 'text-rose-800' : 'text-gray-600',
        )}
        title={dettaglio}
      >
        {dettaglio}
      </span>
      <span
        className={cn(
          'numerico shrink-0 font-extrabold',
          casella ? 'text-black' : 'text-gray-300',
        )}
      >
        {casella ? ore(lavorato) : '—'}
        {straord > 0 && (
          <span className="ml-1 text-[11px] font-bold text-gray-700">
            (di cui {ore(straord)} str.)
          </span>
        )}
      </span>
    </li>
  )
}
