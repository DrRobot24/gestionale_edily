import { useNavigate } from 'react-router'
import { Badge, Card, cn } from '../../ui'
import { dataEstesa, numero } from '../../lib/formato'
import {
  giorniDa,
  quanteDaFare,
  useRimastoIndietro,
  type GiornataFerma,
  type SchedaFerma,
} from './useRimastoIndietro'

/* ══════════════════════════════════════════════════════════════════
   COSA HAI LASCIATO INDIETRO.

   Chiesto dall'utente il 2026-09-22, con queste parole: «il tecnico
   deve sapere che ha delle giornate mai inviate! Ed allo stesso modo
   deve sapere se gli sono state respinte alcune cose. Insomma
   consapevolezza al massimo».

   Nasce da un caso vero, scoperto interrogando il database perche'
   dall'applicazione non si vedeva: Zito aveva quattro giornate ferme
   in due punti diversi, due bozze mai inviate e due inviate da cinque
   giorni. Niente, in tutto il programma, glielo diceva.

   ── PERCHE' STA IN CIMA ─────────────────────────────────────────────

   Sopra il saluto e sopra le card dei cantieri, che e' una posizione
   forte e deliberata. Tutto il resto della home parla del GIORNO che si
   sta guardando; questo parla di cio' che e' rimasto indietro, ed e'
   l'unica cosa che non si scopre altrimenti. Se stesse sotto le card
   verrebbe letto dopo aver gia' cominciato a lavorare su oggi — cioe'
   troppo tardi per cambiare l'ordine delle cose da fare.

   ── SPARISCE QUANDO NON SERVE ───────────────────────────────────────

   Niente riquadro verde «sei in pari»: la home mostra cose da fare, mai
   una bacheca di cio' che e' gia' andato bene, ed e' la regola di tutto
   il progetto. Un pannello permanente in cima insegnerebbe a saltare
   con l'occhio proprio la zona dove un giorno comparira' la cosa
   urgente.

   ── L'ATTESA NON E' UN COMPITO, MA SI DICE ──────────────────────────

   Le giornate inviate e non ancora firmate non chiedono niente al
   tecnico, e non entrano nel conteggio. Ma stanno scritte lo stesso, in
   fondo e senza allarme: servono a non far ricompilare una giornata
   credendola persa, e dopo qualche giorno sono la ragione per andare a
   bussare al titolare. Il conto dei giorni le trasforma da «in corso» a
   «ferme», che e' un'informazione diversa.
   ══════════════════════════════════════════════════════════════════ */

export function RimastoIndietro() {
  const { data, isPending } = useRimastoIndietro()

  if (isPending || !data) return null

  const daFare = quanteDaFare(data)
  const attesa = data.inAttesa.length

  // Niente da dire: il riquadro non esiste proprio.
  if (daFare === 0 && attesa === 0) return null

  return (
    <Card className="overflow-hidden">
      {/* La fascia e' ROSSA solo se c'e' del lavoro suo. Con le sole
          giornate in attesa e' azzurra: quelle non sono colpa di
          nessuno, e un rosso su cose che aspettano qualcun altro
          insegna a non fidarsi del rosso. */}
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-3 border-b-2 border-black px-5 py-3',
          daFare > 0 ? 'bg-rose-300' : 'bg-sky-300',
        )}
      >
        <div>
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-black">
            {daFare > 0 ? 'Hai lasciato indietro' : 'In attesa del titolare'}
          </h2>
          <p className="text-xs font-semibold text-black/70">
            {daFare > 0
              ? `${daFare} ${daFare === 1 ? 'cosa aspetta' : 'cose aspettano'} un tuo gesto`
              : 'Niente da fare: aspettano solo la firma'}
          </p>
        </div>
        {daFare > 0 && (
          <Badge className="bg-white px-3 py-1 text-sm">{daFare}</Badge>
        )}
      </div>

      <div className="divide-y-2 divide-black">
        {/* I RESPINTI PER PRIMI, sempre. Sono l'unica cosa che qualcuno
            ha guardato e rimandato indietro con un motivo: hanno una
            scadenza implicita che una bozza dimenticata non ha, e il
            titolare sta aspettando proprio quelli. */}
        {data.respinte.length > 0 && (
          <Sezione
            titolo="Le tue ore respinte"
            nota="Il titolare le ha rimandate indietro: correggi e rimanda."
            tono="errore"
          >
            {data.respinte.map((g) => (
              <RigaOre key={g.id} giornata={g} mostraMotivo />
            ))}
          </Sezione>
        )}

        {data.rapportiniRespinti.length > 0 && (
          <Sezione
            titolo="Rapportini respinti"
            nota="Da correggere e rimandare."
            tono="errore"
          >
            {data.rapportiniRespinti.map((s) => (
              <RigaScheda key={s.id} scheda={s} mostraMotivo />
            ))}
          </Sezione>
        )}

        {data.bozze.length > 0 && (
          <Sezione
            titolo="Le tue ore mai inviate"
            nota="Le hai scritte ma non sono partite: finché restano qui non arrivano in busta paga."
            tono="attesa"
          >
            {data.bozze.map((g) => (
              <RigaOre key={g.id} giornata={g} />
            ))}
          </Sezione>
        )}

        {data.rapportiniInBozza.length > 0 && (
          <Sezione
            titolo="Rapportini mai inviati"
            nota="Scritti e fermi: il titolare non li ha ancora ricevuti."
            tono="attesa"
          >
            {data.rapportiniInBozza.map((s) => (
              <RigaScheda key={s.id} scheda={s} />
            ))}
          </Sezione>
        )}

        {/* IN FONDO, e senza colore d'allarme: non e' lavoro suo. */}
        {data.inAttesa.length > 0 && (
          <Sezione
            titolo="Le tue ore in attesa di firma"
            nota="Sono arrivate al titolare. Non devi fare niente, ma se passano i giorni vale un sollecito."
            tono="info"
          >
            {data.inAttesa.map((g) => (
              <RigaOre key={g.id} giornata={g} mostraAttesa />
            ))}
          </Sezione>
        )}
      </div>
    </Card>
  )
}

/* ── pezzi ─────────────────────────────────────────────────────── */

type Tono = 'errore' | 'attesa' | 'info'

const FASCIA: Record<Tono, string> = {
  errore: 'text-rose-800',
  attesa: 'text-amber-800',
  info: 'text-sky-800',
}

function Sezione({
  titolo,
  nota,
  tono,
  children,
}: {
  titolo: string
  nota: string
  tono: Tono
  children: React.ReactNode
}) {
  return (
    <div className="px-5 py-3">
      <h3 className={cn('text-xs font-extrabold uppercase tracking-wide', FASCIA[tono])}>
        {titolo}
      </h3>
      {/* La nota dice COSA COMPORTA, non cosa sono. «Finche' restano
          qui non arrivano in busta paga» e' la frase che fa premere il
          pulsante; «sono in bozza» descrive e basta. */}
      <p className="mb-2 text-xs font-semibold text-gray-600">{nota}</p>
      <ul className="grid gap-1.5">{children}</ul>
    </div>
  )
}

function RigaOre({
  giornata: g,
  mostraMotivo = false,
  mostraAttesa = false,
}: {
  giornata: GiornataFerma
  mostraMotivo?: boolean
  mostraAttesa?: boolean
}) {
  const navigate = useNavigate()
  const giorni = mostraAttesa && g.inviato_at ? giorniDa(g.inviato_at.slice(0, 10)) : 0

  return (
    <li>
      <button
        type="button"
        /* Porta alla giornata GIUSTA, non a «Le mie ore» e poi cercala:
           la pagina legge `?data` dall'indirizzo apposta. Un avviso che
           dice cosa manca ma non ci porta costringe a rifare a mano il
           percorso che il programma conosce gia'. */
        onClick={() => navigate(`/mie-ore?data=${g.data}`)}
        className="neo-press flex w-full cursor-pointer flex-wrap items-center justify-between gap-2 rounded-lg border-2 border-black/20 px-3 py-2 text-left hover:border-black hover:bg-amber-50"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-bold capitalize text-black">
            {dataEstesa(g.data)}
            <span className="ml-2 text-xs font-semibold normal-case text-gray-600">
              <span className="numerico">{numero(g.ore)}</span> ore
            </span>
          </p>
          {mostraMotivo && g.motivo_rifiuto && (
            <p className="truncate text-xs font-semibold text-rose-700">
              «{g.motivo_rifiuto}»
            </p>
          )}
          {mostraAttesa && giorni > 0 && (
            <p className="text-xs font-semibold text-gray-600">
              in attesa da {giorni} {giorni === 1 ? 'giorno' : 'giorni'}
            </p>
          )}
        </div>
        {!mostraAttesa && (
          <Badge className="shrink-0 bg-amber-300 px-2 py-0.5 text-[10px]">apri</Badge>
        )}
      </button>
    </li>
  )
}

function RigaScheda({
  scheda: s,
  mostraMotivo = false,
}: {
  scheda: SchedaFerma
  mostraMotivo?: boolean
}) {
  const navigate = useNavigate()

  return (
    <li>
      <button
        type="button"
        onClick={() => navigate(`/rapportini/${s.id}`)}
        className="neo-press flex w-full cursor-pointer flex-wrap items-center justify-between gap-2 rounded-lg border-2 border-black/20 px-3 py-2 text-left hover:border-black hover:bg-amber-50"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-black">{s.cantiere}</p>
          <p className="truncate text-xs font-semibold capitalize text-gray-600">
            {dataEstesa(s.data)}
          </p>
          {mostraMotivo && s.motivo_rifiuto && (
            <p className="truncate text-xs font-semibold normal-case text-rose-700">
              «{s.motivo_rifiuto}»
            </p>
          )}
        </div>
        <Badge className="shrink-0 bg-amber-300 px-2 py-0.5 text-[10px]">apri</Badge>
      </button>
    </li>
  )
}
