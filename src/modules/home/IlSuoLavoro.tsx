import { useNavigate } from 'react-router'
import { Card, cn } from '../../ui'
import { useSession } from '../auth/SessionProvider'
import { useClienti } from '../anagrafiche/clienti'
import { useDipendenti } from '../anagrafiche/dipendenti'
import { useFornitori } from '../anagrafiche/fornitori'
import { useCantieri } from '../cantieri/useCantieri'
import { useGiacenze } from '../magazzino/magazzino'

/* ══════════════════════════════════════════════════════════════════
   I registri di chi tiene l'amministrazione.

   Nasce il 2026-09-17 da una frase dell'utente: la home di Stefania
   mostrava «Validati, non ancora in contabilità», cioe' una coda di
   RAPPORTINI — e a lei i rapportini non interessano, deciso il
   2026-09-15 quando sono usciti dal suo menu. Le serviva invece il
   punto di partenza del suo lavoro vero: le anagrafiche.

   PERCHE' I NUMERI E NON SOLO I LINK. La sidebar ha gia' le stesse
   voci, e rifarle qui come pulsanti sarebbe un doppione. Qui c'e' in
   piu' QUANTI ce ne sono: aprendo il gestionale si vede in un colpo se
   i registri sono pieni o vuoti, che nei primi giorni di un impianto
   nuovo e' esattamente la domanda — «li ho gia' caricati?».

   IL CANCELLO E' SUL PERMESSO, come ovunque nel progetto: chi ha
   `anagrafiche.write` tiene i registri. Non si guarda il ruolo, cosi'
   il giorno che il permesso va a qualcun altro il riquadro lo segue
   senza toccare questo file.

   Il conteggio esce dagli hook che le pagine usano gia', quindi niente
   query nuove e la cache e' condivisa: la RLS ha gia' filtrato per
   azienda.
   ══════════════════════════════════════════════════════════════════ */

export function IlSuoLavoro() {
  const { can } = useSession()

  /* I registri li vede chi li tiene. Senza questo permesso il riquadro
     non ha senso: sarebbero quattro link verso pagine che respingono. */
  const tieneIRegistri = can('anagrafiche.write')

  const { data: clienti } = useClienti()
  const { data: cantieri } = useCantieri()
  const { data: operai } = useDipendenti()
  const { data: fornitori } = useFornitori()
  const { data: giacenze } = useGiacenze()

  if (!tieneIRegistri) return null

  /* I cantieri si contano ATTIVI, non tutti, e la differenza conta: il
     numero deve rispondere a «quanti ne ho aperti adesso», non a
     «quanti ne ho mai avuti». Gli altri tre hook filtrano gia' gli
     archiviati per conto loro (`soloAttivi` vale true di default). */
  const attivi = (cantieri ?? []).filter((c) => c.stato === 'attivo').length

  const registri = [
    {
      etichetta: 'Clienti',
      a: '/anagrafiche/clienti',
      quanti: clienti?.length,
      colore: 'bg-amber-400',
      nota: 'Per chi lavoriamo',
    },
    {
      etichetta: 'Cantieri',
      a: '/cantieri',
      quanti: attivi,
      colore: 'bg-lime-300',
      nota: 'Aperti adesso',
    },
    {
      etichetta: 'Operai',
      a: '/anagrafiche/operai',
      quanti: operai?.length,
      colore: 'bg-sky-300',
      nota: 'In forza',
    },
    {
      etichetta: 'Fornitori',
      a: '/anagrafiche/fornitori',
      quanti: fornitori?.length,
      colore: 'bg-rose-300',
      nota: 'Da chi compriamo',
    },
    {
      etichetta: 'Magazzino',
      a: '/magazzino',
      quanti: giacenze?.length,
      colore: 'bg-white',
      nota: 'Voci a registro',
    },
    /* Subappalti non ha ancora una tabella: la voce di menu e' un
       segnaposto. Il conteggio percio' NON e' zero ma un trattino, e la
       differenza e' tutta: zero direbbe «non ne hai nessuno», che e'
       falso — non c'e' ancora il posto dove metterli. Sta qui, a
       richiesta dell'utente, perche' alla riunione del 21 settembre
       serve far vedere che il posto e' previsto. */
    {
      etichetta: 'Subappalti',
      a: '/subappalti',
      quanti: undefined,
      colore: 'bg-white',
      nota: 'Da costruire',
    },
  ]

  return (
    <Card className="overflow-hidden">
      <div className="border-b-2 border-black bg-white px-5 py-3">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-black">
          I registri
        </h2>
        <p className="mt-0.5 text-xs font-semibold text-gray-600">
          I primi tre nell'ordine di inserimento: un cantiere vuole il suo cliente,
          una squadra vuole gli operai.
        </p>
      </div>

      {/* Tre per riga e non quattro: con sei riquadri, quattro colonne
          ne lascerebbero due spaiati in fondo, e mezza riga bianca in
          una dashboard e' spazio che qualcuno ha dimenticato di usare.
          Due righe piene da tre si leggono meglio di una piena e una
          mezza. */}
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {registri.map((r) => (
          <Riquadro key={r.a} {...r} />
        ))}
      </div>
    </Card>
  )
}

function Riquadro({
  etichetta,
  a,
  quanti,
  colore,
  nota,
}: {
  etichetta: string
  a: string
  quanti: number | undefined
  colore: string
  nota: string
}) {
  const navigate = useNavigate()

  return (
    <button
      type="button"
      onClick={() => navigate(a)}
      className={cn(
        'neo-press cursor-pointer rounded-xl border-2 border-black p-4 text-left shadow-neo',
        colore,
      )}
    >
      {/* Mentre il numero non c'e' ancora si mostra un trattino e non
          uno zero: zero e' un'informazione — «non ne hai» — e darla
          prima di saperla, ogni volta che la pagina si apre, sarebbe
          dire una cosa falsa per mezzo secondo. */}
      <p className="text-3xl font-black leading-none text-black">{quanti ?? '—'}</p>
      <p className="mt-1.5 text-sm font-extrabold uppercase tracking-wide text-black">
        {etichetta}
      </p>
      <p className="text-xs font-semibold text-black/70">{nota}</p>
    </button>
  )
}
