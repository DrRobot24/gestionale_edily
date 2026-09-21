import { useNavigate } from 'react-router'
import { Button, Card, cn } from '../../ui'
import {
  etichetta,
  funzioneMancante,
  ore,
  periodoCorrente,
  sposta,
  totaliDi,
  useGiornateInSospeso,
  useOrePeriodo,
} from '../ore/useOrePeriodo'

/* ══════════════════════════════════════════════════════════════════
   LE ORE ARRIVATE — il riquadro in home di chi fa le paghe.

   Nasce da una domanda dell'utente il 2026-09-21, guardando la home da
   `amministrazione@cassia.com`: «Stefania non vede una sorta di
   notifica quando il titolare gli ha inviato i rapportini validati?».
   Aveva ragione: la voce di menu c'era, ma niente le diceva MAI che era
   arrivato qualcosa. Doveva ricordarsi di andare a guardare.

   PERCHE' NON E' UNA CODA COME QUELLA DEL TITOLARE.

   `GiornateDaValidare` elenca le giornate una per una perche' Giuseppe
   deve entrare in ognuna e firmarla: la coda si consuma, e ogni riga e'
   un gesto. Qui no. Stefania non valida niente e non spunta niente: le
   ore arrivate non sono compiti da smaltire, sono materiale che si
   accumula fino alla chiusura del mese. Elencarle una per una sarebbe
   una lista che non si accorcia mai, e una lista che non si accorcia
   smette di essere letta dopo tre giorni.

   Quindi UN riquadro solo, con la domanda giusta: quante ore sono
   arrivate questa settimana, e c'e' ancora qualcosa per strada.

   LA REGOLA DELLA HOME VALE ANCHE QUI: la dashboard mostra cose da
   fare, mai una bacheca di cio' che e' gia' andato bene. Per questo il
   riquadro SPARISCE quando non c'e' niente di nuovo e niente in
   sospeso: una settimana senza ore e senza giornate ferme non chiede
   nulla a nessuno, e un pannello permanente che dice «0 ore» insegna a
   saltare con l'occhio proprio la zona dove un giorno comparira' la
   cosa importante.
   ══════════════════════════════════════════════════════════════════ */

export function OreArrivate() {
  const navigate = useNavigate()

  const questa = periodoCorrente('settimana')
  const scorsa = sposta(questa, -1)

  const settimana = useOrePeriodo(questa)
  const sospeso = useGiornateInSospeso(questa)

  /* La settimana scorsa si guarda perche' il lunedi' mattina quella in
     corso e' quasi sempre vuota: le ore di venerdi' arrivano quando
     Giuseppe valida, che puo' essere il lunedi' dopo. Un riquadro che
     sparisce ogni lunedi' farebbe pensare che il flusso si sia rotto
     proprio nel giorno in cui si tirano le somme. */
  const precedente = useOrePeriodo(scorsa)
  const sospesoPrecedente = useGiornateInSospeso(scorsa)

  const errore = (settimana.error ?? sospeso.error) as Error | null

  /* Le funzioni non ci sono ancora: e' un file dello schema mai
     eseguito, non un guasto. In home si tace — il posto dove dirlo e'
     la pagina, non la prima schermata del mattino. */
  if (errore && funzioneMancante(errore)) return null
  if (settimana.isPending || sospeso.isPending) return null

  const righe = settimana.data ?? []
  const totali = totaliDi(righe)
  const oreTotali = totali.ordinarie + totali.straordinarie
  const ferme = (sospeso.data ?? []).reduce((s, r) => s + Number(r.giornate), 0)

  const righePrec = precedente.data ?? []
  const fermePrec = (sospesoPrecedente.data ?? []).reduce(
    (s, r) => s + Number(r.giornate),
    0,
  )
  const orePrec = totaliDi(righePrec)
  const oreTotaliPrec = orePrec.ordinarie + orePrec.straordinarie

  /* Si mostra la settimana scorsa quando quella in corso non ha ancora
     niente ma la precedente si': e' il caso del lunedi' mattina. */
  const mostraPrecedente = oreTotali === 0 && ferme === 0 && oreTotaliPrec > 0

  const periodo = mostraPrecedente ? scorsa : questa
  const persone = mostraPrecedente ? righePrec : righe
  const totale = mostraPrecedente ? oreTotaliPrec : oreTotali
  const inSospeso = mostraPrecedente ? fermePrec : ferme

  // Niente di nuovo e niente per strada: il riquadro non ha niente da
  // chiedere, quindi non c'e'.
  if (totale === 0 && inSospeso === 0) return null

  return (
    <Card className="overflow-hidden">
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-3 border-b-2 border-black px-5 py-3',
          inSospeso > 0 ? 'bg-yellow-300' : 'bg-lime-300',
        )}
      >
        <div>
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-black">
            Ore arrivate
          </h2>
          <p className="text-xs font-semibold text-black/70">
            {etichetta(periodo)}
            {mostraPrecedente && ' · settimana scorsa'}
          </p>
        </div>
        <Button dimensione="sm" onClick={() => navigate('/ore')}>
          Vai alle ore
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4">
        <div>
          <div className="text-3xl font-black leading-none">{ore(totale)}</div>
          <div className="text-xs font-bold uppercase tracking-wide text-gray-600">
            ore validate
          </div>
        </div>

        <div>
          <div className="text-3xl font-black leading-none">{persone.length}</div>
          <div className="text-xs font-bold uppercase tracking-wide text-gray-600">
            {persone.length === 1 ? 'persona' : 'persone'}
          </div>
        </div>

        {/* Il numero che conta piu' del totale: se ci sono giornate
            ferme da Giuseppe, quelle ore non sono ancora nei conti e
            chiudere il periodo adesso vorrebbe dire pagarne meno del
            dovuto. Si dice CHE cosa manca, mai di chi: qui non si viene
            a cercare un colpevole. */}
        {inSospeso > 0 && (
          <div className="rounded-lg border-2 border-black bg-white px-3 py-2">
            <div className="text-sm font-black">
              {inSospeso === 1
                ? '1 giornata non ancora validata'
                : `${inSospeso} giornate non ancora validate`}
            </div>
            <div className="text-xs font-semibold text-gray-600">
              Il totale qui sopra è parziale.
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
