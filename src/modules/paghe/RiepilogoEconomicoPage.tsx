import { Fragment, useState } from 'react'
import { data as fmtData, euro, numero } from '../../lib/formato'
import { Avviso, Badge, Button, Campo, CampoSelect, Card, Cifra, RigaTotale, Table, Vuoto, cn } from '../../ui'
import { useSession } from '../auth/SessionProvider'
import { oreContratto, useDipendenti, useOrari, useStipendi } from '../anagrafiche/dipendenti'
import { limitiMese, rigaDelMese, storicoRegimi } from '../anagrafiche/retribuzione'
import { useDataInIndirizzo } from '../home/useDataInIndirizzo'
import { useGiornateInSospeso, useOreGriglia } from '../ore/useOrePeriodo'
import {
  tabellaMancante,
  useAggiungiMovimento,
  useDecidiPaghe,
  useEliminaMovimento,
  useInviaPaghe,
  useMesePaghe,
  useMovimenti,
  useRiapriPaghe,
  useRighePaghe,
  type Movimento,
  type RigaPaghe,
  type TipoMovimento,
} from './riepilogoEconomico'

/* ══════════════════════════════════════════════════════════════════
   IL RIEPILOGO ECONOMICO, dal 2026-09-25: il foglio presenze del mese
   con i soldi accanto.

   Una riga per persona in servizio nel mese — operai, tecnici, impiegati
   — con le ore lavorate, ferie, permessi e altre assenze, quanto ha
   maturato secondo il suo regime (paga globale o giornaliera, vedi
   `retribuzione.ts`), e poi i MOVIMENTI che Stefania scrive col motivo:
   acconti, rimborsi, trattenute. In fondo alla riga, DA BONIFICARE.

   E' diverso dalla pagina Economia della risorsa: quella segue UNA
   persona mese per mese; questa guarda TUTTE le persone in un mese, ed
   e' il foglio su cui il titolare fa i bonifici.

   Il ciclo e la ragione di ogni scelta stanno in
   `riepilogo-economico.sql`. Qui conta una cosa: CHI VALIDA NON ELABORA.
   Il titolare ha tutti i permessi, `paghe.read` compreso: i comandi per
   scrivere e inviare li ha chi fa le paghe e non valida; quelli per
   firmare, respingere e riaprire chi valida.
   ══════════════════════════════════════════════════════════════════ */

const TIPI: Record<TipoMovimento, { etichetta: string; segno: 1 | -1 }> = {
  acconto: { etichetta: 'Acconto', segno: -1 },
  rimborso: { etichetta: 'Rimborso', segno: 1 },
  trattenuta: { etichetta: 'Trattenuta', segno: -1 },
}

function oggiIso() {
  return new Date().toLocaleDateString('sv-SE')
}

export function RiepilogoEconomicoPage() {
  const { can, org } = useSession()
  const puoFirmare = can('rapportini.validate')
  const puoElaborare = can('paghe.read') && !puoFirmare

  /* Il mese sta nell'indirizzo, come il giorno in home: tornando indietro
     da una scheda si ritrova il mese che si stava guardando. Di partenza
     il mese di oggi. */
  const [scelto, setScelto] = useDataInIndirizzo('mese')
  const giorno = scelto ?? oggiIso()
  const { dal, al } = limitiMese(giorno)
  const [anno, mese] = dal.split('-').map(Number)
  const nomeMese = new Date(anno, mese - 1, 1).toLocaleDateString('it-IT', {
    month: 'long',
    year: 'numeric',
  })
  function sposta(di: number) {
    const d = new Date(anno, mese - 1 + di, 1).toLocaleDateString('sv-SE')
    setScelto(d.slice(0, 7) === oggiIso().slice(0, 7) ? null : d)
  }

  const meseQ = useMesePaghe(anno, mese)
  const stato = meseQ.data?.stato ?? 'bozza'
  const fotografato = stato !== 'bozza'

  /* Dal vivo, solo finche' e' in bozza. */
  const persone = useDipendenti({ soloAttivi: false })
  const stipendi = useStipendi({ abilitato: true })
  const { data: orari } = useOrari()
  const ore = useOreGriglia({ passo: 'mese', dal, al }, !fotografato)
  const sospeso = useGiornateInSospeso({ passo: 'mese', dal, al })
  const movimenti = useMovimenti(anno, mese)
  const foto = useRighePaghe(fotografato ? meseQ.data?.id : undefined)

  const [aperta, setAperta] = useState<string | null>(null)

  if (meseQ.error && tabellaMancante(meseQ.error)) {
    return (
      <Avviso tono="info">
        Il Riepilogo economico non è ancora attivo: manca <code>riepilogo-economico.sql</code>{' '}
        nel database.
      </Avviso>
    )
  }
  const errore = meseQ.error ?? persone.error ?? ore.error ?? movimenti.error ?? foto.error
  if (errore) {
    return <Avviso tono="errore">Non riesco a leggere il riepilogo: {(errore as Error).message}</Avviso>
  }
  const carico =
    meseQ.isPending ||
    (fotografato ? foto.isPending : persone.isPending || ore.isPending || movimenti.isPending)

  /* ── le righe: fotografia, o calcolo dal vivo ── */
  const avvisiRiga = new Map<string, string>()
  let righe: RigaPaghe[] = []
  if (fotografato) {
    righe = foto.data ?? []
  } else if (!carico) {
    const conOre = new Set((ore.data ?? []).filter((o) => o.data).map((o) => o.dipendente_id))
    righe = (persone.data ?? [])
      /* Chi era in servizio anche solo un giorno del mese, o ha ore
         validate nel mese: nessuno che abbia lavorato resta fuori
         perche' la sua scheda non e' in ordine. */
      .filter(
        (d) =>
          conOre.has(d.id) ||
          (d.data_impiego !== null &&
            d.data_impiego <= al &&
            (!d.data_cessazione || d.data_cessazione >= dal)),
      )
      .map((d) => {
        const storico = storicoRegimi(stipendi.data, d.dipendente_costi, d.id)
        const r = rigaDelMese(storico, ore.data, d.id, dal, oreContratto(orari, d.id, al))
        const suoi = (movimenti.data ?? []).filter((m) => m.dipendente_id === d.id)
        const somma = (t: TipoMovimento) =>
          suoi.filter((m) => m.tipo === t).reduce((s, m) => s + m.importo, 0)
        const acconti = somma('acconto')
        const rimborsi = somma('rimborso')
        const trattenute = somma('trattenuta')
        const t = r.tariffa

        if (t.origine === 'manca' && r.ore_lavorate > 0)
          avvisiRiga.set(d.id, 'Né paga globale né giornaliera: il lavoro vale zero')
        else if (r.senzaOre)
          avvisiRiga.set(d.id, 'Paga globale, ma nessuna ora validata nel mese')

        return {
          dipendente_id: d.id,
          nominativo: `${d.cognome} ${d.nome}`,
          tipo: d.tipo,
          giorni: r.giorni,
          ore_lavorate: r.ore_lavorate,
          ore_straordinarie: r.ore_straordinarie,
          ore_ferie: r.ore_ferie,
          ore_permessi: r.ore_permessi,
          ore_altre: r.ore_altre,
          regime:
            t.origine === 'calcolata'
              ? 'globale'
              : t.origine === 'manuale'
                ? 'giornaliera'
                : null,
          paga_globale: t.origine === 'calcolata' ? t.paga : null,
          tariffa: t.origine === 'manca' ? null : t.euroOra,
          maturato: r.maturato,
          acconti,
          rimborsi,
          trattenute,
          da_bonificare: Math.round((r.maturato - acconti + rimborsi - trattenute) * 100) / 100,
          movimenti: suoi.map((m) => ({ tipo: m.tipo, importo: m.importo, motivo: m.motivo })),
        } satisfies RigaPaghe
      })
  }

  const totale = (k: keyof RigaPaghe) => righe.reduce((s, r) => s + Number(r[k] ?? 0), 0)

  /* ── «TUTTO COINCIDE?» — le condizioni per inviare ──
     La stampa arriva solo dopo la firma; l'invio solo quando non manca
     niente. Ognuna si dice per esteso, cosi' si sa cosa sistemare. */
  const giornateFerme = (sospeso.data ?? []).reduce((s, g) => s + Number(g.giornate), 0)
  const problemi: string[] = []
  if (!fotografato) {
    if (al >= oggiIso()) problemi.push('il mese non è ancora finito')
    if (giornateFerme > 0)
      problemi.push(
        `${giornateFerme} ${giornateFerme === 1 ? 'giornata non è' : 'giornate non sono'} ancora validate dal titolare`,
      )
    const senzaPaga = righe.filter((r) => r.regime === null && r.ore_lavorate > 0).length
    if (senzaPaga > 0)
      problemi.push(
        `${senzaPaga} ${senzaPaga === 1 ? 'persona ha' : 'persone hanno'} ore ma né paga globale né giornaliera`,
      )
    const negativi = righe.filter((r) => r.da_bonificare < 0).length
    if (negativi > 0)
      problemi.push(
        `${negativi} ${negativi === 1 ? 'riga ha' : 'righe hanno'} più acconti e trattenute che maturato`,
      )
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-4 print:max-w-none print:gap-2">
      {/* A4 orizzontale: dodici colonne in verticale non ci stanno. */}
      <style>{'@media print { @page { size: A4 landscape; margin: 10mm; } }'}</style>

      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-extrabold text-black">Riepilogo economico</h1>
          <p className="text-sm font-semibold text-gray-600">
            Tutte le risorse del mese: ore, assenze, quanto hanno maturato, acconti, rimborsi e
            trattenute. Lo prepara l&rsquo;amministrazione, lo firma il titolare.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button dimensione="sm" onClick={() => sposta(-1)} aria-label="Mese prima">
            ‹
          </Button>
          <span className="min-w-40 text-center text-lg font-extrabold capitalize text-black">
            {nomeMese}
          </span>
          <Button
            dimensione="sm"
            onClick={() => sposta(1)}
            aria-label="Mese dopo"
            // I mesi che devono ancora venire non hanno niente da pagare.
            disabled={dal.slice(0, 7) >= oggiIso().slice(0, 7)}
          >
            ›
          </Button>
        </div>
      </div>

      {/* ── L'INTESTAZIONE DELLA STAMPA ── */}
      <div className="hidden border-b-2 border-black pb-2 print:block">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-700">
          {org?.ragioneSociale}
        </p>
        <h1 className="text-xl font-extrabold capitalize text-black">
          Riepilogo economico · {nomeMese}
        </h1>
        <p className="text-xs font-semibold text-black">
          Validato dal titolare il {fmtData(meseQ.data?.validato_at ?? null)} · stampato il{' '}
          {fmtData(oggiIso())}
        </p>
      </div>

      <StatoMese
        stato={stato}
        motivo={meseQ.data?.motivo ?? null}
        inviatoIl={meseQ.data?.inviato_at ?? null}
        validatoIl={meseQ.data?.validato_at ?? null}
      />

      {!fotografato && problemi.length > 0 && (
        <Avviso tono="info" className="print:hidden">
          Non si può ancora inviare: {problemi.join('; ')}.
        </Avviso>
      )}

      {carico ? (
        <p className="text-sm font-bold text-gray-600">Carico il riepilogo…</p>
      ) : righe.length === 0 ? (
        <Vuoto>Nessuna risorsa in servizio in questo mese.</Vuoto>
      ) : (
        <Table className="print:text-[10px]">
          <thead>
            <tr>
              <th className="print:hidden" />
              <th>Persona</th>
              <th className="!text-right">Gg</th>
              <th className="!text-right">Ore lav.</th>
              <th className="!text-right">Ferie h</th>
              <th className="!text-right">Perm. h</th>
              <th className="!text-right">Altre h</th>
              <th className="!text-right">Paga</th>
              <th className="!text-right">Maturato</th>
              <th className="!text-right">Acconti</th>
              <th className="!text-right">Rimborsi</th>
              <th className="!text-right">Trattenute</th>
              <th className="!text-right">Da bonificare</th>
            </tr>
          </thead>
          <tbody>
            {righe.map((r) => {
              const avviso = avvisiRiga.get(r.dipendente_id)
              const aperto = aperta === r.dipendente_id
              return (
                <Fragment key={r.dipendente_id}>
                  <tr className={cn(aperto && 'bg-amber-50')}>
                    <td className="print:hidden">
                      <button
                        type="button"
                        onClick={() => setAperta(aperto ? null : r.dipendente_id)}
                        aria-expanded={aperto}
                        aria-label={`Movimenti di ${r.nominativo}`}
                        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border-2 border-black bg-white font-black hover:bg-amber-200"
                      >
                        {aperto ? '−' : '+'}
                      </button>
                    </td>
                    <td>
                      <span className="font-bold uppercase">{r.nominativo}</span>
                      {r.tipo && r.tipo !== 'operaio' && (
                        <span className="ml-1.5 text-[10px] font-bold uppercase text-gray-500">
                          {r.tipo}
                        </span>
                      )}
                      {avviso && (
                        <span className="block text-[11px] font-bold text-rose-700 print:hidden">
                          {avviso}
                        </span>
                      )}
                    </td>
                    <Cifra>{numero(r.giorni)}</Cifra>
                    <Cifra>
                      {numero(r.ore_lavorate)}
                      {r.ore_straordinarie > 0 && (
                        <span className="block text-[10px] font-bold text-rose-700">
                          di cui {numero(r.ore_straordinarie)} str.
                        </span>
                      )}
                    </Cifra>
                    <Cifra className="text-gray-700">{r.ore_ferie ? numero(r.ore_ferie) : '—'}</Cifra>
                    <Cifra className="text-gray-700">
                      {r.ore_permessi ? numero(r.ore_permessi) : '—'}
                    </Cifra>
                    <Cifra className="text-gray-700">{r.ore_altre ? numero(r.ore_altre) : '—'}</Cifra>
                    <Cifra>
                      {r.regime === 'globale' ? (
                        <>
                          {euro(r.paga_globale)}
                          <span className="block text-[10px] font-bold text-gray-500">
                            globale{r.tariffa !== null && ` · ${euro(r.tariffa)}/h`}
                          </span>
                        </>
                      ) : r.regime === 'giornaliera' ? (
                        <>
                          {euro(r.tariffa)}/h
                          <span className="block text-[10px] font-bold text-gray-500">
                            giornaliera
                          </span>
                        </>
                      ) : (
                        <span className="text-rose-700">manca</span>
                      )}
                    </Cifra>
                    <Cifra className="font-bold">{euro(r.maturato)}</Cifra>
                    <Cifra>{r.acconti ? `− ${euro(r.acconti)}` : '—'}</Cifra>
                    <Cifra>{r.rimborsi ? `+ ${euro(r.rimborsi)}` : '—'}</Cifra>
                    <Cifra>{r.trattenute ? `− ${euro(r.trattenute)}` : '—'}</Cifra>
                    <Cifra
                      className={cn(
                        'text-sm font-black',
                        r.da_bonificare < 0 ? 'text-rose-700' : 'text-black',
                      )}
                    >
                      {euro(r.da_bonificare)}
                    </Cifra>
                  </tr>
                  {aperto && (
                    <tr className="bg-amber-50 print:hidden">
                      <td />
                      <td colSpan={12} className="pb-3">
                        <Movimenti
                          dipendenteId={r.dipendente_id}
                          anno={anno}
                          mese={mese}
                          fotografati={fotografato ? r.movimenti : null}
                          elenco={(movimenti.data ?? []).filter(
                            (m) => m.dipendente_id === r.dipendente_id,
                          )}
                          modificabile={!fotografato && puoElaborare}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {/* Il totale da bonificare, per chi fa i bonifici: e' il
                numero che deve tornare con l'estratto conto. */}
            <RigaTotale>
              <td className="print:hidden" />
              <td>Totale</td>
              <Cifra>{numero(totale('giorni'))}</Cifra>
              <Cifra>{numero(totale('ore_lavorate'))}</Cifra>
              <Cifra>{numero(totale('ore_ferie'))}</Cifra>
              <Cifra>{numero(totale('ore_permessi'))}</Cifra>
              <Cifra>{numero(totale('ore_altre'))}</Cifra>
              <td />
              <Cifra>{euro(totale('maturato'))}</Cifra>
              <Cifra>{euro(totale('acconti'))}</Cifra>
              <Cifra>{euro(totale('rimborsi'))}</Cifra>
              <Cifra>{euro(totale('trattenute'))}</Cifra>
              <Cifra className="text-sm font-black">{euro(totale('da_bonificare'))}</Cifra>
            </RigaTotale>
          </tbody>
        </Table>
      )}

      {/* ── I MOVIMENTI COL MOTIVO, sulla carta ──
          A schermo stanno dentro le righe; sul foglio dei bonifici vanno
          elencati, perche' un «− 200 €» senza il perche' e' una domanda. */}
      {righe.some((r) => r.movimenti.length > 0) && (
        <div className="hidden print:block">
          <h2 className="mt-2 text-sm font-extrabold uppercase">Acconti, rimborsi e trattenute</h2>
          <ul className="text-[10px]">
            {righe.flatMap((r) =>
              r.movimenti.map((m, i) => (
                <li key={`${r.dipendente_id}-${i}`}>
                  <strong className="uppercase">{r.nominativo}</strong> · {TIPI[m.tipo].etichetta}{' '}
                  {TIPI[m.tipo].segno < 0 ? '−' : '+'} {euro(m.importo)} · {m.motivo}
                </li>
              )),
            )}
          </ul>
        </div>
      )}

      <Comandi
        anno={anno}
        mese={mese}
        stato={stato}
        righe={righe}
        puoElaborare={puoElaborare}
        puoFirmare={puoFirmare}
        puoInviare={!carico && righe.length > 0 && problemi.length === 0}
      />
    </div>
  )
}

/* ── lo stato del mese, in una fascia ─────────────────────────────── */

function StatoMese({
  stato,
  motivo,
  inviatoIl,
  validatoIl,
}: {
  stato: string
  motivo: string | null
  inviatoIl: string | null
  validatoIl: string | null
}) {
  return (
    <div className="grid gap-2 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        {stato === 'validato' ? (
          <Badge colore="info">Validato dal titolare il {fmtData(validatoIl)} · in archivio</Badge>
        ) : stato === 'inviato' ? (
          <Badge colore="attesa">Inviato al titolare il {fmtData(inviatoIl)} · da firmare</Badge>
        ) : (
          <Badge>In preparazione</Badge>
        )}
      </div>
      {/* Il motivo del ritorno: e' la prima cosa da leggere per chi deve
          correggere. */}
      {stato === 'bozza' && motivo && (
        <Avviso tono="errore">Il titolare l&rsquo;ha rimandato indietro: {motivo}</Avviso>
      )}
    </div>
  )
}

/* ── i movimenti di una persona ───────────────────────────────────── */

function Movimenti({
  dipendenteId,
  anno,
  mese,
  fotografati,
  elenco,
  modificabile,
}: {
  dipendenteId: string
  anno: number
  mese: number
  /** Dalla fotografia, se il mese e' gia' inviato. */
  fotografati: RigaPaghe['movimenti'] | null
  elenco: Movimento[]
  modificabile: boolean
}) {
  const aggiungi = useAggiungiMovimento(anno, mese)
  const elimina = useEliminaMovimento()
  const [tipo, setTipo] = useState<TipoMovimento>('acconto')
  const [importo, setImporto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [problema, setProblema] = useState<string | null>(null)

  const righe = fotografati
    ? fotografati.map((m, i) => ({ ...m, id: String(i) }))
    : elenco.map((m) => ({ tipo: m.tipo, importo: m.importo, motivo: m.motivo, id: m.id }))

  function salva() {
    const n = Number(importo.replace(',', '.'))
    if (!(n > 0)) return setProblema('L’importo deve essere maggiore di zero.')
    if (!motivo.trim()) return setProblema('Serve il motivo.')
    setProblema(null)
    aggiungi.mutate(
      { dipendente_id: dipendenteId, tipo, importo: n, motivo: motivo.trim() },
      {
        onSuccess: () => {
          setImporto('')
          setMotivo('')
        },
      },
    )
  }

  return (
    <div className="grid gap-3 rounded-xl border-2 border-black bg-white p-4">
      <p className="text-xs font-extrabold uppercase tracking-wide text-black">
        Acconti, rimborsi e trattenute
      </p>
      {righe.length === 0 ? (
        <p className="text-sm font-semibold text-gray-600">Nessun movimento in questo mese.</p>
      ) : (
        <ul className="grid gap-1">
          {righe.map((m) => (
            <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm">
                <strong>{TIPI[m.tipo].etichetta}</strong> · {m.motivo}
              </span>
              <span className="flex items-baseline gap-3">
                <span className="numerico text-sm font-black">
                  {TIPI[m.tipo].segno < 0 ? '−' : '+'} {euro(m.importo)}
                </span>
                {modificabile && !fotografati && (
                  <button
                    type="button"
                    className="cursor-pointer text-xs font-bold text-gray-600 underline hover:text-black"
                    disabled={elimina.isPending}
                    onClick={() => {
                      if (confirm(`Togliere ${TIPI[m.tipo].etichetta.toLowerCase()} di ${euro(m.importo)}?`))
                        elimina.mutate(m.id)
                    }}
                  >
                    togli
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {modificabile && (
        <div className="grid gap-2 border-t-2 border-gray-200 pt-3 sm:grid-cols-[10rem_9rem_minmax(0,1fr)_auto] sm:items-end">
          <CampoSelect
            etichetta="Cosa"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoMovimento)}
          >
            <option value="acconto">Acconto (−)</option>
            <option value="rimborso">Rimborso (+)</option>
            <option value="trattenuta">Trattenuta (−)</option>
          </CampoSelect>
          <Campo
            etichetta="Importo €"
            type="number"
            step="0.01"
            min="0"
            className="numerico"
            value={importo}
            onChange={(e) => setImporto(e.target.value)}
          />
          <Campo
            etichetta="Motivo"
            placeholder={
              tipo === 'acconto'
                ? 'Acconto del 15, in contanti…'
                : tipo === 'rimborso'
                  ? 'Gasolio anticipato, materiale comprato…'
                  : 'Arretrato di agosto, multa, anticipo spese…'
            }
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <Button variante="primario" dimensione="sm" onClick={salva} disabled={aggiungi.isPending}>
            {aggiungi.isPending ? 'Salvo…' : 'Aggiungi'}
          </Button>
        </div>
      )}
      {problema && <Avviso tono="errore">{problema}</Avviso>}
      {(aggiungi.error ?? elimina.error) && (
        <Avviso tono="errore">{((aggiungi.error ?? elimina.error) as Error).message}</Avviso>
      )}
    </div>
  )
}

/* ── i comandi, secondo chi guarda e lo stato ─────────────────────── */

function Comandi({
  anno,
  mese,
  stato,
  righe,
  puoElaborare,
  puoFirmare,
  puoInviare,
}: {
  anno: number
  mese: number
  stato: string
  righe: RigaPaghe[]
  puoElaborare: boolean
  puoFirmare: boolean
  puoInviare: boolean
}) {
  const invia = useInviaPaghe(anno, mese)
  const decidi = useDecidiPaghe(anno, mese)
  const riapri = useRiapriPaghe(anno, mese)
  const [chiedo, setChiedo] = useState<'respingi' | 'riapri' | null>(null)
  const [motivo, setMotivo] = useState('')
  const errore = (invia.error ?? decidi.error ?? riapri.error) as Error | null

  return (
    <Card className="grid gap-3 p-4 print:hidden">
      <div className="flex flex-wrap items-center gap-3">
        {stato === 'bozza' && puoElaborare && (
          <>
            <Button
              variante="primario"
              disabled={!puoInviare || invia.isPending}
              onClick={() => {
                if (
                  confirm(
                    'Inviare il riepilogo al titolare?\n\nDa quel momento i numeri restano fermi: se c’è da correggere, te lo rimanda indietro lui.',
                  )
                )
                  invia.mutate(righe)
              }}
            >
              {invia.isPending ? 'Invio…' : 'Invia al titolare'}
            </Button>
            <span className="text-xs font-semibold text-gray-600">
              Si invia quando tutto coincide: mese finito, giornate tutte validate, ogni persona con
              la sua paga.
            </span>
          </>
        )}
        {stato === 'bozza' && puoFirmare && (
          <span className="text-sm font-semibold text-gray-600">
            In preparazione dall&rsquo;amministrazione: ti arriva da firmare quando è pronto.
          </span>
        )}

        {stato === 'inviato' && puoFirmare && !chiedo && (
          <>
            <Button
              variante="primario"
              disabled={decidi.isPending}
              onClick={() => {
                if (
                  confirm(
                    'Validare il riepilogo?\n\nVa in archivio: i rapportini del mese diventano archiviati, e si può stampare il PDF per i bonifici.',
                  )
                )
                  decidi.mutate({ valida: true })
              }}
            >
              {decidi.isPending ? 'Firmo…' : 'Valida'}
            </Button>
            <Button variante="danger" onClick={() => setChiedo('respingi')}>
              Rimanda indietro
            </Button>
          </>
        )}
        {stato === 'inviato' && puoElaborare && (
          <span className="text-sm font-semibold text-gray-600">
            Inviato: aspetta la firma del titolare.
          </span>
        )}

        {stato === 'validato' && (
          <>
            {/* LA STAMPA SOLO DOPO LA FIRMA: «stampabile solo quando si e'
                sicuri che tutto coincide» (utente). E' il foglio dei
                bonifici. */}
            <Button variante="primario" onClick={() => window.print()}>
              Stampa PDF
            </Button>
            {puoFirmare && !chiedo && (
              <Button onClick={() => setChiedo('riapri')}>Riapri per modifiche</Button>
            )}
          </>
        )}
      </div>

      {chiedo && (
        <div className="grid gap-2 rounded-xl border-2 border-black bg-rose-50 p-3">
          <Campo
            etichetta={chiedo === 'respingi' ? 'Cosa va corretto?' : 'Perché lo riapri?'}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Lo legge l’amministrazione per sapere cosa sistemare"
          />
          <div className="flex gap-2">
            <Button
              variante="danger"
              dimensione="sm"
              disabled={!motivo.trim() || decidi.isPending || riapri.isPending}
              onClick={() => {
                const dopo = {
                  onSuccess: () => {
                    setChiedo(null)
                    setMotivo('')
                  },
                }
                if (chiedo === 'respingi') decidi.mutate({ valida: false, motivo: motivo.trim() }, dopo)
                else riapri.mutate(motivo.trim(), dopo)
              }}
            >
              {chiedo === 'respingi' ? 'Rimanda indietro' : 'Riapri'}
            </Button>
            <Button dimensione="sm" onClick={() => setChiedo(null)}>
              Annulla
            </Button>
          </div>
        </div>
      )}

      {errore && <Avviso tono="errore">{errore.message}</Avviso>}
    </Card>
  )
}
