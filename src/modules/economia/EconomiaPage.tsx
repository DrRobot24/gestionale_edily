import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Avviso, Button, Card, Input, Select, Table, Vuoto, cn } from '../../ui'
import { data as fmtData } from '../../lib/formato'
import { oggi } from '../rapportini/campiRapportino'
import { filtra, useOreEconomia, type NotaConCantiere } from '../cantieri/noteContabili'

/* ══════════════════════════════════════════════════════════════════
   I lavori extra di tutti i cantieri, insieme.

   Il singolo cantiere risponde a «cosa abbiamo fatto fuori progetto su
   QUESTO cantiere». Ma le domande che contano si fanno un livello sopra:
   cosa ha fatto l'impresa questo mese, e cosa c'e' da ribaltare al
   cliente. Cantiere per cantiere quella risposta si ottiene solo
   aprendo sette pagine e leggendo a mano.

   IL PERIMETRO NON LO DECIDE QUESTA PAGINA, lo decide la RLS. Il tecnico
   vede le note dei cantieri suoi, il titolare e l'amministrazione le
   vedono tutte. Stessa pagina, due risposte diverse, e nessun `if` nel
   frontend a farsi carico di una regola che non gli appartiene.

   NE' ORE NE' IMPORTI, ed e' voluto. Le ore sono uscite il 2026-09-15
   per decisione dell'utente: la contabilita' dei lavori extra la fa lui
   fuori dal gestionale. Qui resta il racconto di cosa e' stato fatto,
   che e' l'unica cosa che al gestionale serviva davvero registrare.
   ══════════════════════════════════════════════════════════════════ */

/** Il primo del mese di una data, in formato YYYY-MM-DD. */
function primoDelMese(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('sv-SE')
}

/** L'ultimo giorno del mese: il giorno 0 del mese successivo. */
function ultimoDelMese(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toLocaleDateString('sv-SE')
}

type Periodo = 'mese' | 'scorso' | 'tutto' | 'scelto'

function intervallo(p: Periodo): { da: string; a: string } {
  const ora = new Date()
  if (p === 'mese') return { da: primoDelMese(ora), a: ultimoDelMese(ora) }
  if (p === 'scorso') {
    const scorso = new Date(ora.getFullYear(), ora.getMonth() - 1, 1)
    return { da: primoDelMese(scorso), a: ultimoDelMese(scorso) }
  }
  // "Tutto" non e' davvero tutto: e' da una data prima della quale
  // questa impresa non esisteva. Una query senza limiti di data e' la
  // stessa cosa con un'aria piu' innocente.
  return { da: '2000-01-01', a: oggi() }
}

export function EconomiaPage() {
  const navigate = useNavigate()

  const [periodo, setPeriodo] = useState<Periodo>('mese')
  const [scelto, setScelto] = useState(() => intervallo('mese'))
  const { da, a } = periodo === 'scelto' ? scelto : intervallo(periodo)

  const [cantiere, setCantiere] = useState('')
  const [cerca, setCerca] = useState('')

  const { data: note, isPending, error } = useOreEconomia(da, a)

  if (error) {
    return <Avviso tono="errore">Non riesco a leggere i lavori extra: {error.message}</Avviso>
  }

  const tutte = note ?? []
  const perCantiere = cantiere ? tutte.filter((n) => n.cantiere_id === cantiere) : tutte
  const viste = filtra(perCantiere, cerca)

  // I cantieri della tendina escono da cio' che c'e' davvero nel
  // periodo: un elenco di tutti i cantieri dell'impresa farebbe scegliere
  // fra decine di voci che danno risultato vuoto.
  const cantieri = new Map<string, string>()
  for (const n of tutte) {
    if (!n.cantiere_id) continue
    cantieri.set(
      n.cantiere_id,
      n.cantiere ? `${n.cantiere.codice} — ${n.cantiere.denominazione}` : 'Cantiere rimosso',
    )
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-4">
      <div>
        <h1 className="text-2xl font-extrabold text-black">Lavori extra</h1>
        <p className="text-sm font-semibold text-gray-600">
          Le lavorazioni fuori progetto di tutti i cantieri. Si segnano compilando il
          rapportino della giornata; qui si guardano insieme.
        </p>
      </div>

      <Card className="grid gap-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ['mese', 'Questo mese'],
              ['scorso', 'Mese scorso'],
              ['tutto', 'Tutto'],
            ] as const
          ).map(([valore, etichetta]) => (
            <button
              key={valore}
              type="button"
              onClick={() => setPeriodo(valore)}
              className={cn(
                'neo-press cursor-pointer rounded-xl border-2 border-black px-3 py-1.5 text-xs font-extrabold',
                periodo === valore ? 'bg-amber-400 shadow-neo-xs' : 'bg-white',
              )}
            >
              {etichetta}
            </button>
          ))}

          <span className="mx-1 text-xs font-bold text-gray-400">oppure</span>

          <label className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase text-gray-600">dal</span>
            <Input
              type="date"
              value={da}
              max={a}
              className="w-auto px-2 py-1 text-xs"
              onChange={(e) => {
                setScelto((s) => ({ ...s, da: e.target.value }))
                setPeriodo('scelto')
              }}
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase text-gray-600">al</span>
            <Input
              type="date"
              value={a}
              min={da}
              className="w-auto px-2 py-1 text-xs"
              onChange={(e) => {
                setScelto((s) => ({ ...s, a: e.target.value }))
                setPeriodo('scelto')
              }}
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <Select
            value={cantiere}
            onChange={(e) => setCantiere(e.target.value)}
            className="py-2 text-sm"
          >
            <option value="">Tutti i cantieri</option>
            {[...cantieri.entries()].map(([id, nome]) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
          </Select>

          <Input
            type="search"
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
            placeholder="Cerca fra le lavorazioni: una parola, o più di una"
            className="py-2 text-sm"
          />
        </div>
      </Card>

      <Riepilogo note={viste} scelto={cantiere} onScegli={setCantiere} />

      {isPending ? (
        <p className="text-sm font-bold text-gray-600">Carico i lavori extra…</p>
      ) : tutte.length === 0 ? (
        <Vuoto>
          Nessun lavoro extra in questo periodo. Si segnano compilando il rapportino
          della giornata, nel riquadro sotto la squadra.
        </Vuoto>
      ) : viste.length === 0 ? (
        <Vuoto>Nessuna lavorazione corrisponde a quello che hai cercato.</Vuoto>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Giorno</th>
              <th>Cantiere</th>
              <th>Lavorazione</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {viste.map((n) => (
              <tr key={n.id}>
                <td className="numerico whitespace-nowrap font-bold">{fmtData(n.data)}</td>
                {/* Il NOME del cantiere, non il codice. «2026-003» non
                    dice niente a chi legge: il codice serve sui
                    documenti, qui serve riconoscere il cantiere. */}
                <td className="font-semibold text-gray-700">
                  {n.cantiere?.denominazione ?? 'Cantiere rimosso'}
                  {n.cantiere?.codice && (
                    <span className="block text-[11px] font-bold text-gray-400">
                      {n.cantiere.codice}
                    </span>
                  )}
                </td>
                {/* `whitespace-pre-wrap`: la lavorazione e' un testo
                    libero che puo' andare a capo — misure e calcoli — e
                    schiacciarlo in una riga sola lo rende illeggibile
                    proprio a chi deve fatturarlo. */}
                <td className="whitespace-pre-wrap font-semibold">
                  {n.descrizione}
                  {n.note && (
                    <span className="block text-xs font-semibold text-gray-500">{n.note}</span>
                  )}
                </td>
                <td className="text-right">
                  {n.cantiere_id && (
                    <Button dimensione="sm" onClick={() => navigate(`/cantieri/${n.cantiere_id}`)}>
                      Apri
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  )
}

/**
 * Il totale grosso e la ripartizione per cantiere.
 *
 * Sta sopra la tabella e non sotto: la domanda e' «quanti lavori extra
 * abbiamo», e la tabella e' la dimostrazione. Farla scorrere fino in
 * fondo per leggere il numero che si cercava e' il modo piu' comune di
 * rendere inutile un riepilogo.
 *
 * Si contano le LAVORAZIONI e non le ore: da quando le ore sono uscite
 * (2026-09-15) il numero che dice qualcosa e' quante volte si e' usciti
 * dal progetto, non un monte ore che nessuno usa.
 */
function Riepilogo({
  note,
  scelto,
  onScegli,
}: {
  note: NotaConCantiere[]
  /** Il cantiere filtrato adesso, `''` quando sono tutti. */
  scelto: string
  onScegli: (id: string) => void
}) {
  if (note.length === 0) return null

  /* L'ID VIAGGIA INSIEME AL NOME, e prima non lo faceva: la mappa
     teneva solo nome e conteggio, che basta a scrivere una riga ma non
     a filtrare. Senza l'id la chip non saprebbe cosa dire alla
     tendina. */
  const perCantiere = new Map<string, { id: string; nome: string; quante: number }>()
  for (const n of note) {
    const chiave = n.cantiere_id ?? 'senza'
    const riga = perCantiere.get(chiave)
    const nome = n.cantiere ? `${n.cantiere.codice} — ${n.cantiere.denominazione}` : 'Cantiere rimosso'
    if (riga) riga.quante += 1
    else perCantiere.set(chiave, { id: chiave, nome, quante: 1 })
  }

  const righe = [...perCantiere.values()].sort((x, y) => y.quante - x.quante)

  return (
    <Card className="grid gap-3 bg-lime-100 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-lime-900">
            Nel periodo
          </p>
          <p className="text-3xl font-extrabold leading-tight text-black">
            {note.length} {note.length === 1 ? 'lavorazione' : 'lavorazioni'}
          </p>
        </div>
        <p className="text-xs font-semibold text-lime-900">
          su {righe.length} {righe.length === 1 ? 'cantiere' : 'cantieri'}
        </p>
      </div>

      {/* LE CHIPS FILTRANO, dal 2026-09-22: «dammi la possibilita' di
          toccare la chip del cantiere cosi' da filtrare tutti quei
          lavori extra per quel cantiere» (utente).

          Erano etichette di sola lettura, e la cosa si notava: dicevano
          «GIARRIZZO CASA · 2» proprio sopra un elenco dove quelle due
          righe stavano mescolate alle altre, e per isolarle bisognava
          scendere alla tendina e ritrovare lo stesso nome.

          PILOTANO LA TENDINA, non un secondo filtro: e' lo stesso
          `cantiere` di stato, quindi premendo una chip la tendina
          sopra si muove da sola e le due non possono raccontare cose
          diverse. Due filtri indipendenti sulla stessa colonna sono il
          modo piu' rapido di far dubitare di cio' che si vede.

          RIPREMERE TOGLIE IL FILTRO. Una chip accesa senza via d'uscita
          costringe a cercare «Tutti i cantieri» nella tendina per
          disfare un gesto fatto qui: l'annullamento sta dove sta
          l'azione.

          La chip scelta e' AMBRA, come il bottone del periodo attivo
          qui sopra: in questa pagina l'ambra vuol gia' dire «e' questo
          che stai guardando».

          ⚠️ La ripartizione si mostra anche con UN cantiere solo quando
          il filtro e' acceso. Prima spariva sotto i due — «con uno solo
          ripeterebbe il totale» — ma filtrando resta un cantiere solo e
          la chip sparirebbe nel momento esatto in cui serve a
          spegnersi. */}
      {(righe.length > 1 || scelto !== '') && (
        <ul className="flex flex-wrap gap-2">
          {righe.map((r) => {
            const attiva = scelto === r.id
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onScegli(attiva ? '' : r.id)}
                  aria-pressed={attiva}
                  title={
                    attiva
                      ? 'Premi di nuovo per vedere tutti i cantieri'
                      : `Mostra solo ${r.nome}`
                  }
                  className={cn(
                    'neo-press cursor-pointer rounded-full border-2 border-black px-3 py-1 text-xs font-bold normal-case text-black',
                    attiva ? 'bg-amber-400 shadow-neo-xs' : 'bg-white hover:bg-amber-100',
                  )}
                >
                  {r.nome} · <strong>{r.quante}</strong>
                  {/* La × dice che si puo' disfare: senza, una chip
                      accesa sembra uno stato e non un interruttore. */}
                  {attiva && <span className="ml-1.5 font-black">×</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
