import { useNavigate } from 'react-router'
import { Badge, Card, cn } from '../../ui'
import { dataEstesa } from '../../lib/formato'
import { useSession } from '../auth/SessionProvider'
import { useCantieri } from '../cantieri/useCantieri'
import { StatoRapportino } from '../rapportini/stato'
import { useRapportini, type Rapportino } from '../rapportini/useRapportini'
import { oggi } from '../rapportini/campiRapportino'

/* ══════════════════════════════════════════════════════════════════
   Le giornate dei giorni scorsi rimaste a meta'.

   Qui prima c'era un riquadro intitolato "Bozze da inviare". Il titolo
   era diventato falso: da quando si manda il Foglio Riepilogativo di
   Giornata, una scheda da sola non si invia piu'. Parte con tutta la sua
   giornata, e solo quando ogni cantiere attivo ne ha una. Quel riquadro
   prometteva un pulsante che non esiste.

   Ma sotto il titolo sbagliato c'era un fatto vero e importante: due
   schede ferme in bozza da giorni voleva dire due GIORNATE mai chiuse.
   Quello e' un problema, e nessuno lo stava dicendo.

   Quindi l'unita' di misura cambia. Non "quali documenti sono in
   bozza", che e' un modo da archivio di guardare la cosa, ma "quali
   giorni sono rimasti aperti e cosa manca per chiuderli".

   Oggi non compare: oggi ha gia' le sue card qui sopra, con il
   contatore e il pulsante per mandare tutto.
   ══════════════════════════════════════════════════════════════════ */

export function GiornateAperte() {
  const navigate = useNavigate()
  const { app } = useSession()
  const { data: cantieri } = useCantieri()
  const { data: rapportini } = useRapportini()

  const giorno = oggi()
  const attivi = (cantieri ?? []).filter((c) => c.stato === 'attivo').length

  /* Quante schede esistono per ogni giorno passato, contando quelle di
     tutti e non solo le mie: il foglio parte quando la giornata e'
     completa, non quando ho finito io. */
  const schedePerGiorno = new Map<string, number>()
  for (const r of rapportini ?? []) {
    if (r.data >= giorno) continue
    schedePerGiorno.set(r.data, (schedePerGiorno.get(r.data) ?? 0) + 1)
  }

  /* Il segnale di "giornata aperta" e' una MIA scheda mai partita:
     bozza, o respinta e non ancora corretta. Una giornata dove non ho
     scritto niente del tutto qui non compare — per trovarla servirebbe
     camminare il calendario all'indietro, e la vista
     `v_rapportini_mancanti` esiste apposta ma va prima verificata. */
  const aperte = new Map<string, Rapportino[]>()
  for (const r of rapportini ?? []) {
    if (r.data >= giorno) continue
    if (r.compilato_da !== app?.userId) continue
    if (r.stato !== 'bozza' && r.stato !== 'respinto') continue
    const gruppo = aperte.get(r.data)
    if (gruppo) gruppo.push(r)
    else aperte.set(r.data, [r])
  }

  if (aperte.size === 0) return null

  return (
    <div className="grid gap-3">
      <div>
        <h2 className="text-lg font-extrabold text-black">Giornate rimaste aperte</h2>
        <p className="text-xs font-semibold text-gray-600">
          Giorni scorsi con schede che non sono mai partite. Per aggiungere quelle che mancano
          si apre il cantiere e si sceglie la data.
        </p>
      </div>

      {[...aperte.entries()].map(([data, righe]) => {
        const fatte = schedePerGiorno.get(data) ?? righe.length
        // `attivi` e' il numero dei cantieri attivi OGGI, non di quel
        // giorno: se nel frattempo uno e' stato chiuso il conto e'
        // approssimato. E' un'indicazione, e il conto vero lo fa il
        // database quando si prova a mandare la giornata.
        const complete = fatte >= attivi
        const daCorreggere = righe.some((r) => r.stato === 'respinto')

        return (
          <Card key={data} className="overflow-hidden">
            <div
              className={cn(
                'flex flex-wrap items-center justify-between gap-3 border-b-2 border-black px-5 py-3',
                daCorreggere ? 'bg-rose-200' : complete ? 'bg-yellow-200' : 'bg-yellow-100',
              )}
            >
              <p className="text-sm font-extrabold capitalize text-black">{dataEstesa(data)}</p>
              <span className="rounded-full border-2 border-black bg-white px-2.5 py-0.5 text-xs font-extrabold">
                {fatte} {fatte === 1 ? 'scheda' : 'schede'} su {attivi}
              </span>
            </div>

            <p className="border-b-2 border-black px-5 py-2 text-xs font-semibold text-gray-700">
              {daCorreggere
                ? 'Il titolare ha rimandato indietro qualcosa: finché non è corretto la giornata non riparte.'
                : complete
                  ? 'Le schede ci sono tutte ma la giornata non è mai partita.'
                  : `Mancano ${attivi - fatte} ${attivi - fatte === 1 ? 'scheda' : 'schede'} prima di poterla mandare.`}
            </p>

            <ul className="divide-y-2 divide-black">
              {righe.map((r) => {
                const cantiere = Array.isArray(r.cantieri) ? r.cantieri[0] : r.cantieri
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/rapportini/${r.id}`)}
                      className="neo-press flex w-full cursor-pointer flex-wrap items-center justify-between gap-3 px-5 py-3 text-left hover:bg-amber-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-black">
                          {cantiere?.codice ? `${cantiere.codice} — ` : ''}
                          {cantiere?.denominazione ?? 'Cantiere non indicato'}
                        </p>
                        {r.stato === 'respinto' && r.motivo_rifiuto && (
                          <p className="truncate text-xs font-semibold text-rose-700">
                            {r.motivo_rifiuto}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {r.numero && (
                          <Badge className="px-2 py-0.5 text-[10px]">
                            n. {r.numero}/{r.anno}
                          </Badge>
                        )}
                        <StatoRapportino stato={r.stato} />
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </Card>
        )
      })}
    </div>
  )
}
