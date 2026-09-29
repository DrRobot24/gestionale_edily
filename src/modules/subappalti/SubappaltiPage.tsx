import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Avviso, Button, Card, Input, Select, Table, Vuoto, cn } from '../../ui'
import { data as fmtData, numero } from '../../lib/formato'
import { oggi } from '../rapportini/campiRapportino'
import { useSession } from '../auth/SessionProvider'
import { filtra, useImprese, useSubappaltiPeriodo, type SubappaltoConCantiere } from './subappalti'

/* ══════════════════════════════════════════════════════════════════
   I SUBAPPALTI DI TUTTI I RAPPORTINI, insieme. Dal 2026-09-29.

   «Con la logica che ha Lavori extra, cosi' da intercettare in maniera
   immersiva su tutti i rapportini quelli in cui c'e' stata attivita' di
   subappalto e le relative note» (utente). Stessa forma: periodo,
   cantiere, ricerca, un riepilogo che filtra toccandolo, la tabella, la
   stampa. In piu' il filtro per IMPRESA, che qui e' la domanda di tutti
   i giorni: «dove e' stata, e cosa ha fatto, la ditta X questo mese?» —
   ed e' il foglio con cui si controlla la sua fattura.

   IL PERIMETRO LO DECIDE LA RLS: il tecnico vede i cantieri suoi, il
   titolare tutti. Nessun `if` qui.
   ══════════════════════════════════════════════════════════════════ */

function primoDelMese(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('sv-SE')
}
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
  return { da: '2000-01-01', a: oggi() }
}

export function SubappaltiPage() {
  const navigate = useNavigate()
  const { org } = useSession()

  const [periodo, setPeriodo] = useState<Periodo>('mese')
  const [scelto, setScelto] = useState(() => intervallo('mese'))
  const { da, a } = periodo === 'scelto' ? scelto : intervallo(periodo)

  const [cantiere, setCantiere] = useState('')
  const [impresa, setImpresa] = useState('')
  const [cerca, setCerca] = useState('')

  const { data, isPending, error } = useSubappaltiPeriodo(da, a)
  const { data: imprese } = useImprese({ tutte: true })
  const nome = (id: string) => imprese?.find((i) => i.id === id)?.ragione_sociale ?? 'Impresa'

  if (error) {
    return <Avviso tono="errore">Non riesco a leggere i subappalti: {error.message}</Avviso>
  }
  if (data?.manca) {
    return (
      <Avviso tono="info">
        I subappalti non sono ancora attivi: manca <code>subappalti.sql</code> nel database.
      </Avviso>
    )
  }

  const tutte = data?.righe ?? []
  const perCantiere = cantiere ? tutte.filter((r) => r.cantiere_id === cantiere) : tutte
  const perImpresa = impresa ? perCantiere.filter((r) => r.fornitore_id === impresa) : perCantiere
  const viste = filtra(perImpresa, cerca, nome)

  // Le tendine escono da cio' che c'e' nel periodo, come nei lavori
  // extra: niente voci che danno un elenco vuoto.
  const cantieri = new Map<string, string>()
  const ditte = new Map<string, string>()
  for (const r of tutte) {
    cantieri.set(
      r.cantiere_id,
      r.cantiere ? `${r.cantiere.codice} — ${r.cantiere.denominazione}` : 'Cantiere rimosso',
    )
    ditte.set(r.fornitore_id, nome(r.fornitore_id))
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-4 print:max-w-none print:gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-extrabold text-black">Subappalti</h1>
          <p className="text-sm font-semibold text-gray-600">
            Le imprese esterne che hanno lavorato nei cantieri, da tutti i rapportini. Si segnano
            compilando il rapportino della giornata; qui si guardano insieme.
          </p>
        </div>
        <Button
          variante="primario"
          onClick={() => window.print()}
          disabled={isPending || viste.length === 0}
        >
          Stampa
        </Button>
      </div>

      {/* L'intestazione della stampa: di chi, quale periodo, quali filtri. */}
      <div className="hidden border-b-2 border-black pb-2 print:block">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-700">
          {org?.ragioneSociale}
        </p>
        <h1 className="text-xl font-extrabold text-black">Subappalti</h1>
        <p className="text-xs font-semibold text-black">
          Dal {fmtData(da)} al {fmtData(a)}
          {cantiere && ` · ${cantieri.get(cantiere) ?? ''}`}
          {impresa && ` · ${ditte.get(impresa) ?? ''}`}
          {cerca.trim() && ` · ricerca «${cerca.trim()}»`}
        </p>
        <p className="text-[10px] font-semibold text-gray-600">Stampato il {fmtData(oggi())}</p>
      </div>

      <Card className="grid gap-3 p-5 print:hidden">
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

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)]">
          <Select value={cantiere} onChange={(e) => setCantiere(e.target.value)} className="py-2 text-sm">
            <option value="">Tutti i cantieri</option>
            {[...cantieri.entries()].map(([id, n]) => (
              <option key={id} value={id}>
                {n}
              </option>
            ))}
          </Select>
          <Select value={impresa} onChange={(e) => setImpresa(e.target.value)} className="py-2 text-sm">
            <option value="">Tutte le imprese</option>
            {[...ditte.entries()].map(([id, n]) => (
              <option key={id} value={id}>
                {n}
              </option>
            ))}
          </Select>
          <Input
            type="search"
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
            placeholder="Cerca fra lavorazioni e note: una parola, o più di una"
            className="py-2 text-sm"
          />
        </div>
      </Card>

      <Riepilogo righe={viste} nome={nome} scelta={impresa} onScegli={setImpresa} />

      {isPending ? (
        <p className="text-sm font-bold text-gray-600">Carico i subappalti…</p>
      ) : tutte.length === 0 ? (
        <Vuoto>
          Nessun subappalto in questo periodo. Si segnano compilando il rapportino della giornata,
          nel riquadro «Subappalto» sotto la squadra.
        </Vuoto>
      ) : viste.length === 0 ? (
        <Vuoto>Nessun subappalto corrisponde ai filtri scelti.</Vuoto>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Giorno</th>
              <th>Cantiere</th>
              <th>Impresa</th>
              <th>Lavorazione</th>
              <th className="!text-right whitespace-nowrap">Persone · ore</th>
              <th className="print:hidden" />
            </tr>
          </thead>
          <tbody>
            {viste.map((r) => (
              <tr key={r.id}>
                <td className="numerico whitespace-nowrap font-bold">{fmtData(r.data)}</td>
                <td className="font-semibold text-gray-700">
                  {r.cantiere?.denominazione ?? 'Cantiere rimosso'}
                  {r.cantiere?.codice && (
                    <span className="block text-[11px] font-bold text-gray-400">{r.cantiere.codice}</span>
                  )}
                </td>
                <td className="font-extrabold uppercase">{nome(r.fornitore_id)}</td>
                <td className="whitespace-pre-wrap font-semibold">
                  {r.lavorazione}
                  {r.note && <span className="block text-xs font-semibold text-gray-500">{r.note}</span>}
                </td>
                <td className="numerico whitespace-nowrap text-right font-semibold">
                  {r.persone !== null ? `${r.persone} pers.` : '—'}
                  {r.ore !== null && <span className="block text-xs text-gray-600">{numero(r.ore)} h</span>}
                </td>
                <td className="text-right print:hidden">
                  <Button dimensione="sm" onClick={() => navigate(`/rapportini/${r.rapportino_id}`)}>
                    Apri
                  </Button>
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
 * Il totale e la ripartizione per impresa. Le chip filtrano, come quelle
 * dei cantieri nei lavori extra: toccata una chip si guarda solo
 * quell'impresa, ritoccandola si torna a tutte. Pilota la stessa
 * tendina, cosi' le due non raccontano cose diverse.
 */
function Riepilogo({
  righe,
  nome,
  scelta,
  onScegli,
}: {
  righe: SubappaltoConCantiere[]
  nome: (id: string) => string
  scelta: string
  onScegli: (id: string) => void
}) {
  if (righe.length === 0) return null

  const giorni = new Set(righe.map((r) => `${r.cantiere_id}|${r.data}`)).size
  const ore = righe.reduce((s, r) => s + (r.ore ?? 0), 0)

  const perImpresa = new Map<string, number>()
  for (const r of righe) perImpresa.set(r.fornitore_id, (perImpresa.get(r.fornitore_id) ?? 0) + 1)
  const chip = [...perImpresa.entries()].sort((x, y) => y[1] - x[1])

  return (
    <Card className="grid gap-3 bg-sky-100 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-sky-900">Nel periodo</p>
          <p className="text-3xl font-extrabold leading-tight text-black">
            {righe.length} {righe.length === 1 ? 'intervento' : 'interventi'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold text-sky-900">
            {giorni} {giorni === 1 ? 'giornata' : 'giornate'} di cantiere · {chip.length}{' '}
            {chip.length === 1 ? 'impresa' : 'imprese'}
          </p>
          {ore > 0 && <p className="text-sm font-extrabold text-black">{numero(ore)} ore segnate</p>}
        </div>
      </div>

      {(chip.length > 1 || scelta !== '') && (
        <ul className="flex flex-wrap gap-2">
          {chip.map(([id, quante]) => {
            const attiva = scelta === id
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onScegli(attiva ? '' : id)}
                  aria-pressed={attiva}
                  title={attiva ? 'Premi di nuovo per vedere tutte le imprese' : `Mostra solo ${nome(id)}`}
                  className={cn(
                    'neo-press cursor-pointer rounded-full border-2 border-black px-3 py-1 text-xs font-bold text-black',
                    attiva ? 'bg-amber-400 shadow-neo-xs' : 'bg-white hover:bg-amber-100',
                  )}
                >
                  {nome(id)} · <strong>{quante}</strong>
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
