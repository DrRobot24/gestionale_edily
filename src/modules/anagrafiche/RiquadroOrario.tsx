import { useState } from 'react'
import { data as fmtData, numero } from '../../lib/formato'
import { Avviso, Button, Campo, Card } from '../../ui'
import {
  ORE_PIENE,
  oreContratto,
  useAggiungiOrario,
  useEliminaOrario,
  useOrari,
} from './dipendenti'

/* ══════════════════════════════════════════════════════════════════
   L'ORARIO DA CONTRATTO di una persona, dal 2026-09-25.

   Tempo pieno a 8 ore, oppure part-time a meno. Vale da una data in poi
   e resta finche' non si cambia — «tutto lineare finche' non viene
   interrotto», l'utente — quindi e' uno storico, come le paghe: i mesi
   passati restano misurati col loro orario.

   Da lui dipendono l'invio della giornata (le ore che «tornano»), il
   verde del foglio presenze, quanto vale una giornata di ferie. Vedi
   `orario-contrattuale.sql`.

   Chi e' a tempo pieno non ha niente di scritto: vale 8. Lo cambiano
   solo Stefania e il titolare.
   ══════════════════════════════════════════════════════════════════ */

export function RiquadroOrario({
  dipendenteId,
  puoScrivere,
}: {
  dipendenteId: string
  puoScrivere: boolean
}) {
  const { data: orari, error } = useOrari()
  const aggiungi = useAggiungiOrario()
  const elimina = useEliminaOrario()
  const [apri, setApri] = useState(false)
  const [dal, setDal] = useState(() => new Date().toLocaleDateString('sv-SE'))
  const [ore, setOre] = useState('4')
  const [note, setNote] = useState('')
  const [problema, setProblema] = useState<string | null>(null)

  const suoi = (orari ?? []).filter((o) => o.dipendente_id === dipendenteId)
  const adesso = oreContratto(orari, dipendenteId)
  const vigente = suoi.find((o) => o.valido_dal <= new Date().toLocaleDateString('sv-SE'))

  function salva() {
    const n = Number(ore.replace(',', '.'))
    if (!dal) return setProblema('Serve la data da cui vale.')
    if (!(n > 0 && n <= 12)) return setProblema('Le ore al giorno vanno da 0,5 a 12.')
    setProblema(null)
    aggiungi.mutate(
      { dipendente_id: dipendenteId, valido_dal: dal, ore_giorno: n, note: note.trim() || null },
      {
        onSuccess: () => {
          setApri(false)
          setNote('')
        },
      },
    )
  }

  return (
    <Card className="grid gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold text-black">Orario</h2>
          <p className="text-sm font-bold text-black">
            {adesso === ORE_PIENE ? 'Tempo pieno' : 'Part-time'} ·{' '}
            <span className="numerico">{numero(adesso)}</span> ore al giorno
            {vigente && (
              <span className="font-semibold text-gray-600"> dal {fmtData(vigente.valido_dal)}</span>
            )}
          </p>
          <p className="text-xs font-semibold text-gray-600">
            È la giornata piena di questa persona: da qui si misurano le ore che tornano, il
            verde del foglio presenze e quanto vale un giorno di ferie.
          </p>
        </div>
        {puoScrivere && !apri && (
          <Button dimensione="sm" onClick={() => setApri(true)}>
            Cambia
          </Button>
        )}
      </div>

      {error && <Avviso tono="errore">Non riesco a leggere l&rsquo;orario: {error.message}</Avviso>}

      {apri && (
        <div className="grid gap-3 rounded-xl border-2 border-black bg-amber-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo
              etichetta="Vale dal"
              type="date"
              value={dal}
              onChange={(e) => setDal(e.target.value)}
            />
            <Campo
              etichetta="Ore al giorno"
              type="number"
              step="0.5"
              min="0.5"
              max="12"
              className="numerico"
              suggerimento="8 per il tempo pieno"
              value={ore}
              onChange={(e) => setOre(e.target.value)}
            />
          </div>
          <Campo
            etichetta="Note"
            placeholder="Part-time concordato, rientro a tempo pieno…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {problema && <Avviso tono="errore">{problema}</Avviso>}
          {aggiungi.isError && <Avviso tono="errore">{(aggiungi.error as Error).message}</Avviso>}
          <div className="flex gap-2">
            <Button variante="primario" dimensione="sm" onClick={salva} disabled={aggiungi.isPending}>
              {aggiungi.isPending ? 'Salvo…' : 'Salva'}
            </Button>
            <Button dimensione="sm" onClick={() => setApri(false)} disabled={aggiungi.isPending}>
              Annulla
            </Button>
          </div>
        </div>
      )}

      {/* Lo storico, solo se c'e' stato un cambio: per chi e' sempre stato
          a tempo pieno non c'e' niente da elencare. */}
      {suoi.length > 0 && (
        <ul className="grid gap-1 border-t-2 border-gray-200 pt-2 text-sm">
          {suoi.map((o) => (
            <li key={o.id} className="flex flex-wrap items-baseline justify-between gap-2">
              <span>
                dal <strong className="numerico">{fmtData(o.valido_dal)}</strong> ·{' '}
                <span className="numerico font-bold">{numero(o.ore_giorno)}</span> ore al giorno
                {o.id === vigente?.id && (
                  <span className="ml-2 text-[10px] font-bold uppercase text-gray-600">
                    in vigore
                  </span>
                )}
                {o.note && <span className="text-gray-600"> · {o.note}</span>}
              </span>
              {puoScrivere && (
                <button
                  type="button"
                  className="cursor-pointer text-xs font-bold text-gray-600 underline hover:text-black"
                  disabled={elimina.isPending}
                  onClick={() => {
                    if (
                      confirm(
                        `Cancellare l'orario di ${numero(o.ore_giorno)} ore dal ${fmtData(o.valido_dal)}?\n\nSolo se era sbagliato: se l'orario è cambiato, inseriscine uno nuovo.`,
                      )
                    )
                      elimina.mutate(o.id)
                  }}
                >
                  cancella
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {elimina.isError && <Avviso tono="errore">{(elimina.error as Error).message}</Avviso>}
    </Card>
  )
}
