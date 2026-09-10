import { Card, cn } from '../../ui'
import { numero } from '../../lib/formato'
import {
  ORE_STANDARD,
  anomaliaDi,
  funzioneMancante,
  useOreGiornata,
  type Anomalia,
  type OrePersona,
} from '../rapportini/useOreGiornata'

/* ══════════════════════════════════════════════════════════════════
   Il controllo delle 8 ore.

   La domanda a cui risponde non se la puo' porre un rapportino da solo:
   e' sulla PERSONA e sul GIORNO, attraverso tutti i cantieri. Mario
   Rossi con 4 ore sul cantiere X e' a posto; Mario Rossi con 4 ore sul X
   piu' 2 sul Y piu' 3 sul Z ha fatto 9 ore, e un'ora e' straordinario
   che nessuno ha ancora dichiarato.

   Compare SOLO quando c'e' qualcosa che non torna. Una giornata che
   quadra non merita un riquadro verde: la home del tecnico deve dire
   cosa fare adesso, e un pannello che si accende sempre e' un pannello
   che si smette di leggere.
   ══════════════════════════════════════════════════════════════════ */

export function ControlloOre({ giorno }: { giorno: string }) {
  const { data, isPending, error } = useOreGiornata(giorno)

  /* Il file dello schema non e' stato eseguito: e' una cosa da fare, non
     un guasto, e va detta con quel tono. Senza questo ramo la home si
     riempirebbe di rosso per una funzione che manca. */
  if (error) {
    if (funzioneMancante(error)) {
      return (
        <Card className="border-dashed p-4">
          <p className="text-xs font-semibold text-gray-600">
            Il controllo delle ore non è ancora attivo: manca la funzione nel database
            (<span className="font-mono">supabase/schema/ore-giornata.sql</span>).
          </p>
        </Card>
      )
    }
    return (
      <Card className="border-rose-500 p-4">
        <p className="text-xs font-semibold text-rose-700">
          Non riesco a controllare le ore della giornata: {error.message}
        </p>
      </Card>
    )
  }

  if (isPending || !data) return null

  const anomalie: { persona: OrePersona; anomalia: Anomalia }[] = []
  for (const persona of data) {
    const anomalia = anomaliaDi(persona)
    if (anomalia) anomalie.push({ persona, anomalia })
  }

  if (anomalie.length === 0) return null

  return (
    <Card className="overflow-hidden">
      <div className="border-b-2 border-black bg-amber-200 px-5 py-3">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-black">
          Controllo delle ore
        </h2>
        <p className="text-xs font-semibold text-gray-700">
          Il conto è sulla persona e sulla giornata, su tutti i cantieri dell&rsquo;impresa. Il
          metro sono {ORE_STANDARD} ore.
        </p>
      </div>

      <ul className="divide-y-2 divide-black">
        {anomalie.map(({ persona, anomalia }) => {
          const totale = Number(persona.ore_ordinarie)
          const altrove = totale + Number(persona.ore_straordinarie) - Number(persona.ore_visibili)
          const straordinario = anomalia.tipo === 'straordinario'

          return (
            <li
              key={persona.dipendente_id}
              className={cn('px-5 py-3', straordinario ? 'bg-amber-50' : 'bg-rose-50')}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-extrabold text-black">{persona.nominativo}</p>
                <p className="text-sm font-bold text-black">
                  {numero(totale)} ore ordinarie
                  {Number(persona.ore_straordinarie) > 0 &&
                    ` + ${numero(persona.ore_straordinarie)} di straordinario`}
                </p>
              </div>

              <p
                className={cn(
                  'mt-1 text-xs font-bold',
                  straordinario ? 'text-amber-800' : 'text-rose-700',
                )}
              >
                {straordinario
                  ? `${frase(anomalia.ore)} oltre le ${ORE_STANDARD}: è straordinario. In quale cantiere l’ha fatto? Aprilo e spostale da ordinarie a straordinarie.`
                  : `Mancano ${frase(anomalia.ore)} alle ${ORE_STANDARD}. Segna il motivo: permesso, malattia, o quello che è stato.`}
              </p>

              {/* Quanto sta fuori dal perimetro di chi guarda. Si dice il
                  quanto e mai il dove: il totale di giornata serve a chi
                  compila, la mappa di chi lavora dove no. */}
              {altrove > 0 && (
                <p className="mt-1 text-xs font-semibold text-gray-600">
                  Di queste, {numero(altrove)} sono su cantieri che non sono fra i tuoi.
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

/** "1 ora" e non "1 ore". Una svista che fa sembrare improvvisato tutto
 *  il resto della schermata. */
function frase(ore: number): string {
  return ore === 1 ? '1 ora' : `${numero(ore)} ore`
}
