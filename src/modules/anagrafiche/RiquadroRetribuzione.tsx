import { useState } from 'react'
import { data as fmtData, euro, numero } from '../../lib/formato'
import { Avviso, Button, Campo, Card, Cifra, Table, cn } from '../../ui'
import { useOreGriglia } from '../ore/useOrePeriodo'
import {
  useAggiungiStipendio,
  useAggiungiTariffa,
  useEliminaStipendio,
  useStipendi,
} from './dipendenti'
import {
  limitiMese,
  regimeVigente,
  storicoRegimi,
  tariffaDelMese,
  useEliminaTariffa,
  type Regime,
  type TariffaManuale,
} from './retribuzione'

/* ══════════════════════════════════════════════════════════════════
   UN RIQUADRO SOLO per quanto costa una persona, dal 2026-09-25.

   Prima erano due, «Paga mensile» e «Tariffe», compilabili tutti e due
   — e allora quale valeva? L'utente: «il campo deve essere uno solo da
   compilare: o si inserisce la paga mensile o la tariffa oraria». Con
   la paga la tariffa la calcola il programma, mese per mese; con la
   tariffa il mese costa le ore che ha fatto. La regola sta in
   `retribuzione.ts`.

   Si sceglie COSA inserire, poi UN numero e da quando vale. Lo storico
   mescola le due cose in una lista sola, perche' e' una storia sola:
   «da settembre a paga mensile, prima a tariffa».

   I NOMI SONO QUELLI DELL'UTENTE (2026-09-25): a importo mensile e'
   PAGA GLOBALE — dipende dai giorni lavorati e dalle ore di ognuno — a
   tariffa oraria e' PAGA GIORNALIERA — dipende solo dalle ore fatte a
   quella tariffa. Nel codice restano `paga` e `tariffa`.

   Lo vede solo chi ha `paghe.read`: il chiamante non lo monta per gli
   altri, e la RLS non darebbe comunque le righe.
   ══════════════════════════════════════════════════════════════════ */

export function RiquadroRetribuzione({
  dipendenteId,
  tariffe,
  puoScrivere,
}: {
  dipendenteId: string
  tariffe: TariffaManuale[]
  puoScrivere: boolean
}) {
  const oggi = new Date().toLocaleDateString('sv-SE')
  const { data: stipendi, isPending, error } = useStipendi({ dipendenteId, abilitato: true })
  const storico = storicoRegimi(stipendi, tariffe, dipendenteId)
  const vigente = regimeVigente(storico, oggi)

  const [apri, setApri] = useState(false)

  return (
    <Card className="grid gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold text-black">Retribuzione</h2>
          <p className="text-xs font-semibold text-gray-600">
            Paga globale (un importo al mese) o paga giornaliera (una tariffa oraria): una
            delle due. Con la paga globale la tariffa la calcola il programma, mese per mese.
          </p>
        </div>
        {puoScrivere && !apri && (
          <Button dimensione="sm" onClick={() => setApri(true)}>
            {storico.length === 0 ? 'Inserisci' : 'Cambia'}
          </Button>
        )}
      </div>

      {error && <Avviso tono="errore">Non riesco a leggere la paga: {error.message}</Avviso>}

      {!isPending && storico.length === 0 && !apri && (
        <Avviso tono="errore">
          Né paga globale né paga giornaliera: le ore di questa persona valgono zero euro.
        </Avviso>
      )}

      {apri && (
        <NuovoRegime
          dipendenteId={dipendenteId}
          storico={storico}
          partenza={vigente?.tipo ?? 'paga'}
          onChiudi={() => setApri(false)}
        />
      )}

      {/* La tariffa calcolata, mese per mese: c'e' solo se ORA si e' a
          paga mensile. E' il numero che Stefania prima si calcolava a
          mano. */}
      {vigente?.tipo === 'paga' && (
        <TariffeCalcolate dipendenteId={dipendenteId} storico={storico} />
      )}

      {storico.length > 0 && (
        <Storico storico={storico} vigente={vigente} puoScrivere={puoScrivere} />
      )}
    </Card>
  )
}

/* ── inserire un regime nuovo ─────────────────────────────────────── */

function NuovoRegime({
  dipendenteId,
  storico,
  partenza,
  onChiudi,
}: {
  dipendenteId: string
  storico: Regime[]
  partenza: Regime['tipo']
  onChiudi: () => void
}) {
  const aggiungiPaga = useAggiungiStipendio()
  const aggiungiTariffa = useAggiungiTariffa()
  const [tipo, setTipo] = useState<Regime['tipo']>(partenza)
  const [dal, setDal] = useState(() => new Date().toLocaleDateString('sv-SE'))
  const [importo, setImporto] = useState('')
  const [note, setNote] = useState('')
  const [problema, setProblema] = useState<string | null>(null)

  const inCorso = aggiungiPaga.isPending || aggiungiTariffa.isPending
  const errore = (aggiungiPaga.error ?? aggiungiTariffa.error) as Error | null

  function salva() {
    const n = Number(importo.replace(',', '.'))
    if (!dal) return setProblema('Serve la data da cui vale.')
    if (!(n > 0)) return setProblema('L’importo deve essere maggiore di zero.')
    /* MAI TUTTE E DUE: due righe che partono lo stesso giorno, una paga
       e una tariffa, non direbbero quale vale. */
    const stessoGiorno = storico.find((r) => r.valido_dal === dal)
    if (stessoGiorno) {
      return setProblema(
        `C’è già una ${stessoGiorno.tipo === 'paga' ? 'paga globale' : 'paga giornaliera'} che parte il ${fmtData(dal)}. Scegli un altro giorno, o cancella quella se era sbagliata.`,
      )
    }
    setProblema(null)
    const pulite = note.trim() || null
    const dopo = { onSuccess: onChiudi }
    if (tipo === 'paga') {
      aggiungiPaga.mutate(
        { dipendente_id: dipendenteId, valido_dal: dal, importo_mensile: n, note: pulite },
        dopo,
      )
    } else {
      aggiungiTariffa.mutate(
        {
          dipendente_id: dipendenteId,
          valido_dal: dal,
          costo_orario: n,
          // Un campo solo: lo straordinario costa come l'ordinario.
          costo_orario_straordinario: null,
          tariffa_vendita_oraria: null,
          note: pulite,
        },
        dopo,
      )
    }
  }

  return (
    <div className="grid gap-3 rounded-xl border-2 border-black bg-amber-50 p-4">
      {/* La scelta PRIMA del numero: e' lei a dire cosa vuol dire. */}
      <div className="flex overflow-hidden rounded-xl border-2 border-black sm:w-fit">
        {(
          [
            ['paga', 'Paga globale'],
            ['tariffa', 'Paga giornaliera'],
          ] as const
        ).map(([v, etichetta]) => (
          <button
            key={v}
            type="button"
            onClick={() => setTipo(v)}
            aria-pressed={tipo === v}
            className={cn(
              'flex-1 cursor-pointer px-4 py-2 text-sm font-extrabold',
              tipo === v ? 'bg-amber-400' : 'bg-white hover:bg-amber-100',
              v === 'tariffa' && 'border-l-2 border-black',
            )}
          >
            {etichetta}
          </button>
        ))}
      </div>
      <p className="text-xs font-semibold text-gray-700">
        {tipo === 'paga'
          ? 'Un importo al mese: quello che entra in tasca alla persona in un mese regolare. Dipende dai giorni lavorati e dalle ore di ognuno: la tariffa oraria la calcola il programma, importo ÷ ore del mese, comprese ferie e permessi.'
          : 'Una tariffa oraria: il mese vale le ore fatte davvero a quella tariffa. Lo straordinario costa uguale.'}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo
          etichetta="Vale dal"
          type="date"
          value={dal}
          onChange={(e) => setDal(e.target.value)}
        />
        <Campo
          etichetta={tipo === 'paga' ? 'Importo mensile €' : 'Tariffa oraria €'}
          type="number"
          step="0.01"
          min="0"
          className="numerico"
          value={importo}
          onChange={(e) => setImporto(e.target.value)}
        />
      </div>
      <Campo
        etichetta="Note"
        placeholder="Passaggio di livello, rinnovo, accordo nuovo…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {problema && <Avviso tono="errore">{problema}</Avviso>}
      {errore && <Avviso tono="errore">{errore.message}</Avviso>}
      <div className="flex gap-2">
        <Button variante="primario" dimensione="sm" onClick={salva} disabled={inCorso}>
          {inCorso ? 'Salvo…' : 'Salva'}
        </Button>
        <Button dimensione="sm" onClick={onChiudi} disabled={inCorso}>
          Annulla
        </Button>
      </div>
    </div>
  )
}

/* ── la tariffa calcolata, mese per mese ──────────────────────────── */

/** Tre mesi, il corrente e i due prima: `ore_griglia` legge al massimo
 *  92 giorni, e tre mesi ci stanno sempre. */
function TariffeCalcolate({ dipendenteId, storico }: { dipendenteId: string; storico: Regime[] }) {
  const oggi = new Date().toLocaleDateString('sv-SE')
  const [a, m] = oggi.split('-').map(Number)
  const mesi = [0, 1, 2].map((indietro) =>
    new Date(a, m - 1 - indietro, 1).toLocaleDateString('sv-SE'),
  )
  const dal = mesi[2]
  const al = limitiMese(oggi).al
  const { data: righe, isPending, error } = useOreGriglia({ passo: 'mese', dal, al })

  if (error) {
    return (
      <Avviso tono="info">
        Non riesco a leggere le ore per calcolare la tariffa: {(error as Error).message}
      </Avviso>
    )
  }

  return (
    <div className="grid gap-2 rounded-xl border-2 border-black bg-lime-50 p-4">
      <p className="text-xs font-extrabold uppercase tracking-wide text-black">
        Tariffa oraria calcolata
      </p>
      <p className="text-[11px] font-semibold text-gray-600">
        Paga globale ÷ ore del mese: quelle lavorate più ferie, permessi e assenze. Solo le
        giornate già validate dal titolare: il mese in corso si aggiorna fino alla fine.
      </p>
      {isPending ? (
        <p className="text-sm font-semibold text-gray-600">Carico le ore…</p>
      ) : (
        <ul className="grid gap-1">
          {mesi.map((mese) => {
            const t = tariffaDelMese(storico, righe, dipendenteId, mese)
            const nome = new Date(`${mese}T00:00:00`).toLocaleDateString('it-IT', {
              month: 'long',
              year: 'numeric',
            })
            return (
              <li
                key={mese}
                className="flex flex-wrap items-baseline justify-between gap-2 border-t border-lime-200 pt-1 first:border-t-0 first:pt-0"
              >
                <span className="text-sm font-bold capitalize text-black">{nome}</span>
                {t.origine === 'calcolata' ? (
                  <span className="text-sm font-semibold text-gray-700">
                    <span className="numerico">{euro(t.paga)}</span> ÷{' '}
                    <span className="numerico">{numero(t.ore)}</span> h ={' '}
                    <strong className="numerico text-base font-black text-black">
                      {euro(t.euroOra)}/h
                    </strong>
                    {t.provvisoria && (
                      <span className="ml-1.5 text-[10px] font-extrabold uppercase text-amber-700">
                        provvisoria
                      </span>
                    )}
                  </span>
                ) : t.origine === 'in-attesa' ? (
                  <span className="text-xs font-semibold text-gray-500">
                    nessuna ora validata
                  </span>
                ) : t.origine === 'manuale' ? (
                  <span className="text-xs font-semibold text-gray-500">
                    paga giornaliera: <span className="numerico">{euro(t.euroOra)}/h</span>
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-gray-500">—</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/* ── lo storico ───────────────────────────────────────────────────── */

function Storico({
  storico,
  vigente,
  puoScrivere,
}: {
  storico: Regime[]
  vigente: Regime | null
  puoScrivere: boolean
}) {
  const eliminaPaga = useEliminaStipendio()
  const eliminaTariffa = useEliminaTariffa()
  const errore = (eliminaPaga.error ?? eliminaTariffa.error) as Error | null

  return (
    <>
      {errore && <Avviso tono="errore">{errore.message}</Avviso>}
      <Table>
        <thead>
          <tr>
            <th>Vale dal</th>
            <th>Cosa</th>
            <th className="text-right">Importo</th>
            <th>Note</th>
            {puoScrivere && <th />}
          </tr>
        </thead>
        <tbody>
          {storico.map((r) => (
            <tr key={`${r.tipo}-${r.id}`} className={r === vigente ? 'bg-lime-100' : undefined}>
              <td className="numerico whitespace-nowrap font-bold">
                {fmtData(r.valido_dal)}
                {r === vigente && (
                  <span className="ml-2 text-[10px] font-bold uppercase text-gray-600">
                    in vigore
                  </span>
                )}
              </td>
              <td className="whitespace-nowrap font-semibold">
                {r.tipo === 'paga' ? 'Paga globale' : 'Paga giornaliera'}
              </td>
              <Cifra>
                {euro(r.importo)}
                {r.tipo === 'tariffa' ? '/h' : ''}
              </Cifra>
              <td className="text-gray-600">{r.note ?? '—'}</td>
              {puoScrivere && (
                <td className="text-right">
                  <button
                    type="button"
                    className="cursor-pointer text-xs font-bold text-gray-600 underline hover:text-black"
                    disabled={eliminaPaga.isPending || eliminaTariffa.isPending}
                    onClick={() => {
                      const cosa = r.tipo === 'paga' ? 'la paga globale' : 'la paga giornaliera'
                      if (
                        confirm(
                          `Cancellare ${cosa} di ${euro(r.importo)} valida dal ${fmtData(r.valido_dal)}?\n\nSi cancella solo se era stata scritta per sbaglio: se è cambiata, inseriscine una nuova.`,
                        )
                      ) {
                        if (r.tipo === 'paga') eliminaPaga.mutate(r.id)
                        else eliminaTariffa.mutate(r.id)
                      }
                    }}
                  >
                    cancella
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  )
}
