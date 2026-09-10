import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Avviso, Badge, Button, Card, Input, Select, Table, Vuoto, cn } from '../../ui'
import { data as fmtData, numero as fmtNumero } from '../../lib/formato'
import { oggi } from '../rapportini/campiRapportino'
import { filtra, sommaOre, useOreEconomia, type NotaConCantiere } from '../cantieri/noteContabili'

/* ══════════════════════════════════════════════════════════════════
   Le ore in economia di tutti i cantieri, insieme.

   Il singolo cantiere risponde a «quante ore fuori progetto ha QUESTO
   cantiere». Ma le domande che contano si fanno un livello sopra:
   quante ne ha l'impresa questo mese, e cosa c'e' da ribaltare al
   cliente. Cantiere per cantiere quella risposta si ottiene solo
   aprendo sette pagine e sommando a mano.

   IL PERIMETRO NON LO DECIDE QUESTA PAGINA, lo decide la RLS. Il tecnico
   vede le note dei cantieri suoi, il titolare e l'amministrazione le
   vedono tutte. Stessa pagina, due risposte diverse, e nessun `if` nel
   frontend a farsi carico di una regola che non gli appartiene.

   Niente importi, ed e' voluto: qui ci sono le ore e il motivo. Quanto
   valgono lo dice la tariffa concordata col cliente, e i soldi stanno in
   `costi_cantiere` e `ricavi_cantiere`.
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
    return <Avviso tono="errore">Non riesco a leggere le ore in economia: {error.message}</Avviso>
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
        <h1 className="text-2xl font-extrabold text-black">Ore in economia</h1>
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

      <Riepilogo note={viste} />

      {isPending ? (
        <p className="text-sm font-bold text-gray-600">Carico le ore in economia…</p>
      ) : tutte.length === 0 ? (
        <Vuoto>
          Nessuna ora in economia in questo periodo. Si segnano compilando il rapportino
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
              <th className="text-right">Ore</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {viste.map((n) => (
              <tr key={n.id}>
                <td className="numerico whitespace-nowrap font-bold">{fmtData(n.data)}</td>
                <td className="text-gray-600">{n.cantiere?.codice ?? '—'}</td>
                <td className="font-semibold">
                  {n.descrizione}
                  {n.note && (
                    <span className="block text-xs font-semibold text-gray-500">{n.note}</span>
                  )}
                </td>
                <td className="numerico text-right font-extrabold">{fmtNumero(n.ore)}</td>
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
 * Sta sopra la tabella e non sotto: la domanda e' «quante ore», e la
 * tabella e' la dimostrazione. Farla scorrere fino in fondo per leggere
 * il numero che si cercava e' il modo piu' comune di rendere inutile un
 * riepilogo.
 */
function Riepilogo({ note }: { note: NotaConCantiere[] }) {
  const totale = sommaOre(note)
  if (note.length === 0) return null

  const perCantiere = new Map<string, { nome: string; ore: number }>()
  for (const n of note) {
    const chiave = n.cantiere_id ?? 'senza'
    const riga = perCantiere.get(chiave)
    const nome = n.cantiere ? `${n.cantiere.codice} — ${n.cantiere.denominazione}` : 'Cantiere rimosso'
    if (riga) riga.ore += Number(n.ore)
    else perCantiere.set(chiave, { nome, ore: Number(n.ore) })
  }

  const righe = [...perCantiere.values()].sort((x, y) => y.ore - x.ore)

  return (
    <Card className="grid gap-3 bg-lime-100 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-lime-900">
            Totale nel periodo
          </p>
          <p className="text-3xl font-extrabold leading-tight text-black">
            {fmtNumero(totale)} ore
          </p>
        </div>
        <p className="text-xs font-semibold text-lime-900">
          {note.length} {note.length === 1 ? 'lavorazione' : 'lavorazioni'} su {righe.length}{' '}
          {righe.length === 1 ? 'cantiere' : 'cantieri'}
        </p>
      </div>

      {/* La ripartizione compare solo con piu' di un cantiere: con uno
          solo ripeterebbe il totale con altre parole. */}
      {righe.length > 1 && (
        <ul className="flex flex-wrap gap-2">
          {righe.map((r) => (
            <li key={r.nome}>
              <Badge className="bg-white px-3 py-1 text-xs normal-case">
                {r.nome} · <strong>{fmtNumero(r.ore)} h</strong>
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
