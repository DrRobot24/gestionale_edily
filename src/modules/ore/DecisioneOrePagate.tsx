import { useState } from 'react'
import { data as fmtData } from '../../lib/formato'
import { Avviso, Button, Campo } from '../../ui'
import { useMesePaghe } from '../paghe/riepilogoEconomico'
import {
  orePagateDelGiorno,
  useDecidiOrePagate,
  useTogliOrePagate,
  type OrePagate,
} from './orePagate'
import { ore } from './useOrePeriodo'

/* ══════════════════════════════════════════════════════════════════
   QUANTE ORE PAGA IL TITOLARE, su una giornata gialla. Dal 2026-09-29.

   «Appena vede una cella gialla [...] il titolare deve dire se le 2 ore
   mancanti le vuole pagare, e quindi si normalizza da 6 a 8, oppure se
   ci sono 10 ore di cui 2 di straordinario puo' dire: io ne pago solo 1
   e l'altra no» (utente).

   Si sceglie FRA LE ORE LAVORATE E LA GIORNATA PIENA, estremi compresi:
   da 6 lavorate si paga fra 6 e 8, da 10 fra 8 e 10. Di sabato e
   domenica la giornata attesa e' zero: si paga fra 0 e le lavorate.

   Le ore validate non cambiano: sono il flusso dal campo alla scrivania.
   Cambia solo quanto vale la giornata nel Riepilogo economico.

   Decide chi valida; chi fa le paghe legge la decisione. Col foglio
   definitivo del mese gia' inviato non si cambia piu'.
   ══════════════════════════════════════════════════════════════════ */

export function DecisioneOrePagate({
  dipendenteId,
  giorno,
  lavorate,
  attesa,
  decisione,
  puoDecidere,
}: {
  dipendenteId: string
  giorno: string
  lavorate: number
  /** La giornata piena di quella persona quel giorno; 0 nel fine
   *  settimana. */
  attesa: number
  decisione: OrePagate | undefined
  puoDecidere: boolean
}) {
  const [anno, mese] = giorno.split('-').map(Number)
  const meseQ = useMesePaghe(anno, mese)
  const chiuso = Boolean(meseQ.data && meseQ.data.stato !== 'bozza')

  const stato = orePagateDelGiorno(decisione, lavorate)
  const [apri, setApri] = useState(false)

  const basso = Math.min(lavorate, attesa)
  const alto = Math.max(lavorate, attesa)

  return (
    <div className="border-t-2 border-black bg-emerald-50 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[11px] font-black uppercase tracking-wide">Quante ore si pagano</span>
          <p className="text-xs font-semibold text-gray-800">
            {stato.decisa ? (
              <>
                Il titolare paga{' '}
                <strong className="numerico">{ore(stato.ore)}</strong> ore su{' '}
                <span className="numerico">{ore(lavorate)}</span> lavorate
                <span className="text-gray-500">
                  {' '}
                  · deciso il {fmtData(decisione!.deciso_at.slice(0, 10))}
                </span>
                {decisione!.nota && <span className="block text-gray-700">{decisione!.nota}</span>}
              </>
            ) : stato.daRivedere ? (
              <span className="text-rose-800">
                La giornata è cambiata dopo la decisione (erano {ore(decisione!.ore_lavorate)} ore,
                pagate {ore(decisione!.ore_pagate)}): si pagano le{' '}
                <span className="numerico">{ore(lavorate)}</span> lavorate finché non si decide di
                nuovo.
              </span>
            ) : (
              <>
                Le <span className="numerico">{ore(lavorate)}</span> lavorate
                {puoDecidere ? '. Puoi decidere di pagarne di più o di meno.' : ': decide il titolare.'}
              </>
            )}
          </p>
        </div>
        {puoDecidere && !chiuso && !apri && (
          <Button dimensione="sm" onClick={() => setApri(true)}>
            {stato.decisa ? 'Cambia' : 'Decidi'}
          </Button>
        )}
      </div>

      {puoDecidere && chiuso && (
        <p className="mt-1 text-[11px] font-semibold text-gray-600">
          Il foglio definitivo di questo mese è già stato inviato: la decisione non si cambia più.
        </p>
      )}

      {apri && (
        <Scelta
          dipendenteId={dipendenteId}
          giorno={giorno}
          lavorate={lavorate}
          attesa={attesa}
          basso={basso}
          alto={alto}
          decisione={stato.decisa ? decisione : undefined}
          vecchia={decisione}
          onChiudi={() => setApri(false)}
        />
      )}
    </div>
  )
}

function Scelta({
  dipendenteId,
  giorno,
  lavorate,
  attesa,
  basso,
  alto,
  decisione,
  vecchia,
  onChiudi,
}: {
  dipendenteId: string
  giorno: string
  lavorate: number
  attesa: number
  basso: number
  alto: number
  /** La decisione in vigore, se c'e'. */
  decisione: OrePagate | undefined
  /** Anche quella da rivedere: tornando alle lavorate va tolta. */
  vecchia: OrePagate | undefined
  onChiudi: () => void
}) {
  const decidi = useDecidiOrePagate()
  const togli = useTogliOrePagate()
  const [valore, setValore] = useState(String(decisione?.ore_pagate ?? attesa))
  const [nota, setNota] = useState(decisione?.nota ?? '')
  const [problema, setProblema] = useState<string | null>(null)
  const inCorso = decidi.isPending || togli.isPending

  function salva(n: number) {
    if (!(n >= basso && n <= alto))
      return setProblema(`Si sceglie fra ${ore(basso)} e ${ore(alto)} ore.`)
    setProblema(null)
    /* Pagare le lavorate e' non decidere niente: la decisione, se c'era,
       si toglie invece di scrivere una riga che dice la stessa cosa. */
    if (n === lavorate) {
      if (vecchia) togli.mutate(vecchia.id, { onSuccess: onChiudi })
      else onChiudi()
      return
    }
    decidi.mutate(
      {
        dipendente_id: dipendenteId,
        data: giorno,
        ore_lavorate: lavorate,
        ore_pagate: n,
        nota: nota.trim() || null,
      },
      { onSuccess: onChiudi },
    )
  }

  /* Le due scelte di tutti i giorni, a un click: la giornata piena e le
     lavorate. Il numero libero per il caso in mezzo (10 lavorate, ne
     paga 9). */
  const scelte: { etichetta: string; ore: number }[] = [
    {
      etichetta:
        attesa === 0
          ? 'Non pagarle'
          : lavorate < attesa
            ? `Paga la giornata piena · ${ore(attesa)}`
            : `Paga solo la giornata piena · ${ore(attesa)}`,
      ore: attesa,
    },
    { etichetta: `Paga le lavorate · ${ore(lavorate)}`, ore: lavorate },
  ]

  return (
    <div className="mt-2 grid gap-3 rounded-lg border-2 border-black bg-white p-3">
      <div className="flex flex-wrap gap-2">
        {scelte.map((s) => (
          <Button
            key={s.etichetta}
            dimensione="sm"
            variante={s.ore === Number(valore) ? 'primario' : 'secondario'}
            disabled={inCorso}
            onClick={() => setValore(String(s.ore))}
          >
            {s.etichetta}
          </Button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
        <Campo
          etichetta="Ore da pagare"
          type="number"
          step="0.5"
          min={basso}
          max={alto}
          className="numerico"
          suggerimento={`Fra ${ore(basso)} e ${ore(alto)}`}
          value={valore}
          onChange={(e) => setValore(e.target.value)}
        />
        <Campo
          etichetta="Nota"
          placeholder="Facoltativa: pioggia, uscita concordata…"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
        />
      </div>
      {problema && <Avviso tono="errore">{problema}</Avviso>}
      {(decidi.error ?? togli.error) && (
        <Avviso tono="errore">{((decidi.error ?? togli.error) as Error).message}</Avviso>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variante="primario"
          dimensione="sm"
          disabled={inCorso}
          onClick={() => salva(Number(valore.replace(',', '.')))}
        >
          {inCorso ? 'Salvo…' : 'Conferma'}
        </Button>
        <Button dimensione="sm" onClick={onChiudi} disabled={inCorso}>
          Annulla
        </Button>
      </div>
    </div>
  )
}
