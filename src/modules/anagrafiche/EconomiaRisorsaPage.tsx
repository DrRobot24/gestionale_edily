import { useState } from 'react'
import { useParams } from 'react-router'
import { data as fmtData, euro, giornoPiu, numero } from '../../lib/formato'
import { Avviso, Button, Campo, Card, Cifra, Percorso, RigaTotale, Table, cn } from '../../ui'
import { oggi } from '../rapportini/campiRapportino'
import { tabellaMancante } from '../rapportini/useGiustificazioni'
import { oreContratto, useDipendente, useOrari } from './dipendenti'
import {
  contoFerie,
  perMese,
  usePercepito,
  useGiornateRisorsa,
  useMonteFerie,
  useSalvaMonteFerie,
  type MeseRisorsa,
  type MonteFerie,
} from './economiaRisorsa'

/* ══════════════════════════════════════════════════════════════════
   ECONOMIA DI UNA RISORSA — una sottopagina della scheda.

   Chiesta dall'utente il 2026-09-23: «mese per mese, quanto ha percepito
   al netto una persona, quanti giorni ha lavorato, quanti in ferie, in
   malattia o in permesso, le ferie maturate, i permessi residui».

   UNA SOTTOPAGINA E NON UNA SEZIONE DELLA SCHEDA: la scheda anagrafica e'
   gia' lunga, e questa e' un'altra domanda — non «chi e'», ma «com'e'
   andato il suo anno». Ci si arriva dal pulsante «Economia» nella scheda,
   e la freccia in alto riporta li'.

   I NUMERI DELLE ORE ESCONO DALLE GIORNATE VALIDATE, come il Foglio
   presenze: una giornata ancora dal titolare qui non c'e'. Lo dice la
   riga sotto il titolo, perche' un mese che sembra corto potrebbe solo
   essere non ancora firmato.
   ══════════════════════════════════════════════════════════════════ */

const MESI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]

/** Ore in giorni da otto, per le colonne che si leggono a giornate. */
/* In giorni della SUA giornata piena: otto ore a tempo pieno, quattro per
   un part-time da quattro (2026-09-25). */
const giorni = (ore: number, oreGiorno: number) =>
  ore === 0 ? '—' : numero(ore / oreGiorno)
const oreONiente = (ore: number) => (ore === 0 ? '—' : numero(ore))

export function EconomiaRisorsaPage() {
  const { id } = useParams()
  const adesso = oggi()
  const annoCorrente = Number(adesso.slice(0, 4))
  const [anno, setAnno] = useState(annoCorrente)

  const { data: persona } = useDipendente(id)
  const { data: orari } = useOrari()
  const oreGiorno = oreContratto(orari, id ?? '', adesso)
  const nome = persona ? `${persona.cognome} ${persona.nome}` : '…'

  const inizioAnno = `${anno}-01-01`
  const fineAnno = anno === annoCorrente ? adesso : `${anno}-12-31`
  const { data: giornate, error: erroreGiornate, isPending } = useGiornateRisorsa(
    id,
    inizioAnno,
    fineAnno,
  )
  const { data: percepito } = usePercepito(id, anno)
  const { data: monte, error: erroreMonte } = useMonteFerie(id)

  /* Il goduto si conta dal giorno dopo il saldo fino a oggi, qualunque
     sia l'anno guardato: il residuo e' una fotografia di adesso. */
  const { data: dalSaldo } = useGiornateRisorsa(
    monte ? id : undefined,
    monte ? giornoPiu(monte.saldi_al, 1) : adesso,
    adesso,
  )

  const mancaSql =
    Boolean(erroreMonte && tabellaMancante(erroreMonte as Error))

  /* I mesi da mostrare: l'anno in corso fino al mese di oggi, gli anni
     passati per intero. I mesi futuri sarebbero righe di trattini. */
  const ultimoMese = anno === annoCorrente ? Number(adesso.slice(5, 7)) : 12
  const mesi = perMese(giornate ?? [], anno).slice(0, ultimoMese)
  const totale = mesi.reduce<MeseRisorsa>(
    (t, m) => ({
      mese: 0,
      giorniLavorati: t.giorniLavorati + m.giorniLavorati,
      oreOrdinarie: t.oreOrdinarie + m.oreOrdinarie,
      oreStraordinarie: t.oreStraordinarie + m.oreStraordinarie,
      ferie: t.ferie + m.ferie,
      malattia: t.malattia + m.malattia,
      permesso: t.permesso + m.permesso,
      altre: t.altre + m.altre,
    }),
    { mese: 0, giorniLavorati: 0, oreOrdinarie: 0, oreStraordinarie: 0, ferie: 0, malattia: 0, permesso: 0, altre: 0 },
  )
  const percepitoAnno = [...(percepito?.values() ?? [])].reduce(
    (t, p) => t + (p.percepito ?? 0),
    0,
  )

  return (
    <div className="mx-auto grid max-w-6xl gap-4">
      <Percorso
        indietro={{ etichetta: nome, a: `/anagrafiche/operai/${id}` }}
        qui={[{ etichetta: 'Economia' }]}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-black">Economia · {nome}</h1>
          <p className="text-xs font-semibold text-gray-600">
            Giorni e ore dalle sole giornate validate dal titolare · il percepito dal Riepilogo
            economico firmato
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button dimensione="sm" onClick={() => setAnno(anno - 1)} aria-label="Anno precedente">
            ‹
          </Button>
          <span className="numerico text-lg font-black">{anno}</span>
          <Button
            dimensione="sm"
            onClick={() => setAnno(anno + 1)}
            disabled={anno >= annoCorrente}
            aria-label="Anno successivo"
          >
            ›
          </Button>
        </div>
      </div>

      {mancaSql && (
        <Avviso tono="info">
          Il conto di ferie e permessi non è ancora attivo: manca{' '}
          <code>economia-risorse.sql</code> nel database. Il resto si legge lo stesso.
        </Avviso>
      )}

      {!mancaSql && id && (
        <FeriePermessi
          dipendenteId={id}
          monte={monte ?? null}
          giornate={dalSaldo ?? []}
          oggi={adesso}
          oreGiorno={oreGiorno}
        />
      )}

      <Card className="overflow-hidden">
        <div className="border-b-2 border-black bg-white px-5 py-3">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-black">
            Mese per mese
          </h2>
        </div>

        {erroreGiornate ? (
          <Avviso tono="errore" className="m-4">
            Non riesco a leggere le giornate: {(erroreGiornate as Error).message}
          </Avviso>
        ) : isPending ? (
          <p className="px-5 py-4 text-sm font-semibold text-gray-600">Carico l&rsquo;anno…</p>
        ) : (
          <div className="p-4">
            <Table>
              <thead>
                <tr>
                  <th>Mese</th>
                  <th className="!text-right">Giorni lav.</th>
                  <th className="!text-right">Ore ord.</th>
                  <th className="!text-right">Straord.</th>
                  <th className="!text-right">Ferie (gg)</th>
                  <th className="!text-right">Malattia (gg)</th>
                  <th className="!text-right">Permessi (h)</th>
                  <th className="!text-right">Altre ass. (gg)</th>
                  <th className="!text-right">Percepito</th>
                </tr>
              </thead>
              <tbody>
                {mesi.map((m) => (
                  <tr key={m.mese}>
                    <td className="font-bold">{MESI[m.mese - 1]}</td>
                    <Cifra>{m.giorniLavorati || '—'}</Cifra>
                    <Cifra>{oreONiente(m.oreOrdinarie)}</Cifra>
                    <Cifra className={m.oreStraordinarie > 0 ? 'text-rose-700' : ''}>
                      {oreONiente(m.oreStraordinarie)}
                    </Cifra>
                    <Cifra>{giorni(m.ferie, oreGiorno)}</Cifra>
                    <Cifra>{giorni(m.malattia, oreGiorno)}</Cifra>
                    <Cifra>{oreONiente(m.permesso)}</Cifra>
                    <Cifra>{giorni(m.altre, oreGiorno)}</Cifra>
                    {/* Dal Riepilogo economico: la cifra c'e' solo a
                        mese firmato dal titolare. */}
                    <Cifra>
                      {percepito?.get(m.mese)?.percepito != null ? (
                        euro(percepito.get(m.mese)!.percepito)
                      ) : percepito?.get(m.mese)?.stato === 'inviato' ? (
                        <span className="text-[11px] font-bold text-amber-700">da firmare</span>
                      ) : (
                        '—'
                      )}
                    </Cifra>
                  </tr>
                ))}
                <RigaTotale>
                  <td>Totale {anno}</td>
                  <Cifra>{totale.giorniLavorati || '—'}</Cifra>
                  <Cifra>{oreONiente(totale.oreOrdinarie)}</Cifra>
                  <Cifra>{oreONiente(totale.oreStraordinarie)}</Cifra>
                  <Cifra>{giorni(totale.ferie, oreGiorno)}</Cifra>
                  <Cifra>{giorni(totale.malattia, oreGiorno)}</Cifra>
                  <Cifra>{oreONiente(totale.permesso)}</Cifra>
                  <Cifra>{giorni(totale.altre, oreGiorno)}</Cifra>
                  <Cifra>{percepitoAnno > 0 ? euro(percepitoAnno) : '—'}</Cifra>
                </RigaTotale>
              </tbody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  )
}

/**
 * Il residuo di ferie e permessi, e dove si imposta il monte annuo.
 *
 * Senza un monte impostato non si mostra nessun residuo: un «0 ore di
 * ferie» direbbe che non ne ha, quando invece nessuno ha ancora scritto
 * quante gliene spettano. Meglio chiedere il dato che inventarlo.
 */
function FeriePermessi({
  dipendenteId,
  monte,
  giornate,
  oggi: adesso,
  oreGiorno,
}: {
  dipendenteId: string
  monte: MonteFerie | null
  giornate: Parameters<typeof contoFerie>[1]
  oggi: string
  oreGiorno: number
}) {
  const [modifica, setModifica] = useState(false)

  if (!monte || modifica) {
    return (
      <ModuloMonte
        dipendenteId={dipendenteId}
        monte={monte}
        onFatto={() => setModifica(false)}
        onAnnulla={monte ? () => setModifica(false) : undefined}
      />
    )
  }

  const ferie = contoFerie(monte, giornate, 'ferie', adesso)
  const permessi = contoFerie(monte, giornate, 'permesso', adesso)

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-black bg-white px-5 py-3">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-black">
          Ferie e permessi · oggi
        </h2>
        <Button dimensione="sm" onClick={() => setModifica(true)}>
          Modifica monte e saldo
        </Button>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <Conto
          titolo="Ferie"
          conto={ferie}
          annuo={monte.ferie_annue_ore}
          saldiAl={monte.saldi_al}
          oreGiorno={oreGiorno}
        />
        <Conto
          titolo="Permessi"
          conto={permessi}
          annuo={monte.permessi_annui_ore}
          saldiAl={monte.saldi_al}
          oreGiorno={oreGiorno}
        />
      </div>
    </Card>
  )
}

function Conto({
  titolo,
  conto,
  annuo,
  saldiAl,
  oreGiorno,
}: {
  titolo: string
  conto: ReturnType<typeof contoFerie>
  annuo: number
  saldiAl: string
  oreGiorno: number
}) {
  const negativo = conto.residuo < 0
  return (
    <div
      className={cn(
        'rounded-xl border-2 border-black p-4',
        negativo ? 'bg-rose-100' : 'bg-lime-100',
      )}
    >
      <p className="text-[11px] font-extrabold uppercase tracking-wide text-gray-700">
        {titolo} residue
      </p>
      <p className="numerico text-2xl font-black text-black">
        {numero(conto.residuo)} h
        <span className="ml-2 text-sm font-bold text-gray-600">
          ({numero(conto.residuo / oreGiorno)} gg)
        </span>
      </p>
      <p className="mt-2 text-xs font-semibold text-gray-700">
        <span className="numerico">{numero(conto.saldo)}</span> h al {fmtData(saldiAl)} ·{' '}
        + <span className="numerico">{numero(conto.maturato)}</span> h maturate ·{' '}
        − <span className="numerico">{numero(conto.goduto)}</span> h godute
      </p>
      <p className="mt-1 text-[11px] font-semibold text-gray-500">
        Monte annuo <span className="numerico">{numero(annuo)}</span> h: matura 1/12 per ogni
        mese completato.
      </p>
    </div>
  )
}

function ModuloMonte({
  dipendenteId,
  monte,
  onFatto,
  onAnnulla,
}: {
  dipendenteId: string
  monte: MonteFerie | null
  onFatto: () => void
  onAnnulla?: () => void
}) {
  const salva = useSalvaMonteFerie()
  const [campi, setCampi] = useState({
    ferie_annue_ore: String(monte?.ferie_annue_ore ?? ''),
    permessi_annui_ore: String(monte?.permessi_annui_ore ?? ''),
    saldo_ferie_ore: String(monte?.saldo_ferie_ore ?? '0'),
    saldo_permessi_ore: String(monte?.saldo_permessi_ore ?? '0'),
    saldi_al: monte?.saldi_al ?? oggi(),
  })
  const n = (v: string) => Number(v.replace(',', '.'))
  const valido =
    campi.ferie_annue_ore !== '' &&
    campi.permessi_annui_ore !== '' &&
    campi.saldi_al !== '' &&
    [campi.ferie_annue_ore, campi.permessi_annui_ore, campi.saldo_ferie_ore, campi.saldo_permessi_ore].every(
      (v) => !Number.isNaN(n(v)),
    )

  const cambia = (k: keyof typeof campi) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCampi((c) => ({ ...c, [k]: e.target.value }))

  return (
    <Card className="overflow-hidden">
      <div className="border-b-2 border-black bg-amber-100 px-5 py-3">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-black">
          Ferie e permessi · da impostare
        </h2>
        <p className="text-xs font-semibold text-gray-600">
          Dal cedolino: quante ore spettano in un anno, e il residuo a una certa data. Da lì il
          gestionale matura 1/12 al mese e scala le assenze validate.
        </p>
      </div>
      <div className="grid gap-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Campo etichetta="Ferie annue (ore)" inputMode="decimal" value={campi.ferie_annue_ore} onChange={cambia('ferie_annue_ore')} />
          <Campo etichetta="Permessi annui (ore)" inputMode="decimal" value={campi.permessi_annui_ore} onChange={cambia('permessi_annui_ore')} />
          <Campo etichetta="Ferie residue (ore)" inputMode="decimal" value={campi.saldo_ferie_ore} onChange={cambia('saldo_ferie_ore')} />
          <Campo etichetta="Permessi residui (ore)" inputMode="decimal" value={campi.saldo_permessi_ore} onChange={cambia('saldo_permessi_ore')} />
          <Campo etichetta="Residui alla data" type="date" value={campi.saldi_al} onChange={cambia('saldi_al')} />
        </div>
        {salva.error && <Avviso tono="errore">{salva.error.message}</Avviso>}
        <div className="flex gap-2">
          <Button
            variante="primario"
            disabled={!valido || salva.isPending}
            onClick={() =>
              salva.mutate(
                {
                  dipendente_id: dipendenteId,
                  ferie_annue_ore: n(campi.ferie_annue_ore),
                  permessi_annui_ore: n(campi.permessi_annui_ore),
                  saldo_ferie_ore: n(campi.saldo_ferie_ore),
                  saldo_permessi_ore: n(campi.saldo_permessi_ore),
                  saldi_al: campi.saldi_al,
                },
                { onSuccess: onFatto },
              )
            }
          >
            {salva.isPending ? 'Salvo…' : 'Salva'}
          </Button>
          {onAnnulla && <Button onClick={onAnnulla}>Annulla</Button>}
        </div>
      </div>
    </Card>
  )
}
