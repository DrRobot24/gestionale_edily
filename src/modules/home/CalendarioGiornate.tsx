import { Card, cn } from '../../ui'
import { eFineSettimana } from '../../lib/giorni'
import { griglieDelMese, giornoPiu, meseEAnno } from '../../lib/formato'
import { useSession } from '../auth/SessionProvider'
import { useMioDipendente } from '../anagrafiche/dipendenti'
import { oggi } from '../rapportini/campiRapportino'
import { ASPETTO_GIORNATA, statoGiornataTecnico, type StatoGiornata } from './statoGiornata'
import {
  cantieriAttesi,
  oreDelTecnico,
  raggruppaPerGiorno,
  useConsegneDelMese,
} from './useConsegneDelMese'

/* ══════════════════════════════════════════════════════════════════
   Il calendario da scrivania delle giornate.

   Ha preso il posto di «Giornate rimaste aperte», che elencava una card
   per giorno con dentro tutte le schede: corretto come informazione,
   ma era mezza schermata di righe da leggere per sapere una cosa che si
   guarda in un colpo d'occhio. L'utente l'ha detto cosi' il 2026-09-15:
   «questa e' una dashboard, non un elenco di uno schema di database».

   Quindi la stessa informazione cambia forma. Un mese, quaranta
   caselle, e il colore dice se quel giorno chiede qualcosa. I dettagli
   non sparicono: si aprono sotto, cliccando il giorno.

   I COLORI, e perche' sono questi tre:

     rosso   la giornata non e' completa: mancano schede, oppure il
             titolare ne ha rimandata indietro una. Chiede lavoro.
     giallo  le schede ci sono tutte e sono partite, ma il titolare non
             ha ancora firmato. Non chiede niente a te: sta aspettando
             lui.
     verde   tutte le schede di quel giorno sono validate (o
             contabilizzate). Chiuso.

   Un giorno senza nessuna scheda e' ROSSO se era dovuto — feriale,
   passato, con cantieri assegnati quel giorno — e bianco altrimenti
   (dal 2026-09-23, vedi `statoGiornataTecnico`). Prima restava sempre
   bianco, e la dimenticanza totale era l'unica a non vedersi.

   I CANTIERI ATTESI sono quelli assegnati al tecnico QUEL giorno, dalle
   date di `cantiere_assegnazioni` incrociate con quelle del cantiere:
   un cantiere aperto oggi non rende rosse le giornate passate.
   ══════════════════════════════════════════════════════════════════ */

/* LA REGOLA DEL COLORE NON STA PIU' QUI. Era privata del file, con
   scritto che se un giorno fosse servita anche al titolare andava in un
   file suo: e' successo il 2026-09-22, quando la home del titolare ha
   avuto il suo calendarietto delle consegne. Ora sta in
   `statoGiornata.ts` e la usano in due, cosi' i due calendari non
   possono dire cose diverse sullo stesso giorno. */

const INIZIALI = ['L', 'M', 'M', 'G', 'V', 'S', 'D']

export function CalendarioGiornate({
  giorno,
  onScegli,
}: {
  giorno: string
  onScegli: (g: string) => void
}) {
  /* GLI STESSI DATI E LA STESSA REGOLA DEL TITOLARE, dal 2026-09-23.

     Prima questo calendario contava i cantieri attivi DI OGGI e li
     applicava a tutto il mese, e lasciava bianco il giorno senza
     nessuna scheda. Il titolare invece ragionava sugli incarichi giorno
     per giorno. Due calendari sullo stesso tecnico potevano dire cose
     diverse, e il 14, 15 e 16 settembre — cantieri assegnati, niente
     compilato — restavano bianchi per tutti e due.

     Adesso il tecnico legge `useConsegneDelMese` e
     `statoGiornataTecnico` come il titolare: cio' che vede lui e' cio'
     che vede chi lo aspetta, casella per casella. */
  const { app } = useSession()
  const { data: mio } = useMioDipendente()
  const { data: consegne } = useConsegneDelMese(giorno)

  const io = { userId: app?.userId ?? '', dipendenteId: mio?.id ?? '', nominativo: '' }
  const perGiorno = raggruppaPerGiorno(consegne?.rapportini ?? [], io)
  const mieOre = oreDelTecnico(consegne?.ore ?? [], io)
  const attese = consegne?.attese ?? []
  const assenti = consegne?.assenti ?? new Set<string>()

  const celle = griglieDelMese(giorno)
  const adesso = oggi()

  /* Niente larghezza massima qui: la stringe la colonna della griglia
     in `Dashboard`, che gli mette accanto le ore della giornata. Con
     `max-w-sm` e nessun vicino restava mezza riga bianca. */
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b-2 border-black bg-white px-4 py-2">
        <button
          type="button"
          aria-label="Mese precedente"
          onClick={() => onScegli(meseIndietro(giorno))}
          className="neo-press rounded-lg border-2 border-black bg-white px-2.5 py-1 text-xs font-extrabold"
        >
          ‹
        </button>

        <p className="text-sm font-extrabold capitalize text-black">{meseEAnno(giorno)}</p>

        {/* Il mese successivo si spegne quando siamo nel mese di oggi:
            oltre non c'e' niente da guardare, solo caselle spente. */}
        <button
          type="button"
          aria-label="Mese successivo"
          disabled={giorno.slice(0, 7) >= oggi().slice(0, 7)}
          onClick={() => onScegli(meseAvanti(giorno))}
          className="neo-press rounded-lg border-2 border-black bg-white px-2.5 py-1 text-xs font-extrabold disabled:cursor-not-allowed disabled:text-gray-300"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 p-3">
        {INIZIALI.map((i, k) => (
          <span
            key={`${i}-${k}`}
            className={cn(
              'pb-1 text-center text-[10px] font-extrabold uppercase',
              // Le ultime due colonne sono sabato e domenica.
              k >= 5 ? 'text-gray-400' : 'text-gray-500',
            )}
          >
            {i}
          </span>
        ))}

        {celle.map((cella, k) => {
          if (!cella) return <span key={`vuota-${k}`} />

          const stato: StatoGiornata = consegne
            ? statoGiornataTecnico({
                rapportini: perGiorno.get(cella) ?? [],
                cantieriAttesi: cantieriAttesi(attese, io.userId, cella),
                ore: mieOre.get(cella) ?? null,
                nonFeriale: eFineSettimana(cella),
                passata: cella < adesso,
                assente: assenti.has(`${io.dipendenteId}|${cella}`),
              })
            : 'vuota'
          const scelto = cella === giorno
          const futuro = cella > adesso
          /* Sabato e domenica non sono giornate da compilare: si
             riconoscono a colpo d'occhio invece di far contare le
             colonne. Il grigio dice «non ti riguarda» senza dire
             «errore», che sarebbe il rosso. */
          const nonFeriale = eFineSettimana(cella)

          return (
            <button
              key={cella}
              type="button"
              disabled={futuro}
              onClick={() => onScegli(cella)}
              aria-current={scelto ? 'date' : undefined}
              title={descrizione(stato)}
              className={cn(
                'relative aspect-square rounded-lg border-2 text-xs font-bold',
                stato === 'vuota'
                  ? nonFeriale
                    ? 'bg-gray-200 text-gray-500'
                    : 'bg-white'
                  : ASPETTO_GIORNATA[stato],
                scelto ? 'border-black ring-2 ring-black ring-offset-1' : 'border-black/30',
                futuro
                  ? 'cursor-not-allowed text-gray-300'
                  : 'neo-press cursor-pointer text-black hover:border-black',
              )}
            >
              {Number(cella.slice(8, 10))}
              {/* Oggi si riconosce anche quando stai guardando un altro
                  giorno: senza, sfogliando indietro si perde il punto
                  di partenza. */}
              {cella === adesso && (
                <span className="absolute inset-x-0 bottom-0.5 text-[8px] font-extrabold uppercase">
                  oggi
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t-2 border-black bg-gray-50 px-4 py-2">
        <Legenda colore="bg-rose-300" testo="da chiudere" />
        <Legenda colore="bg-yellow-300" testo="dal titolare" />
        {/* Verde = validata, azzurro = archiviata: scambiati il
            2026-09-22 insieme al calendario del titolare. I due
            calendari leggono la stessa funzione e devono dire la stessa
            cosa — se qui il verde volesse dire un'altra cosa, tecnico e
            titolare guarderebbero lo stesso giorno vedendo due colori
            diversi. */}
        <Legenda colore="bg-lime-300" testo="validata" />
        <Legenda colore="bg-sky-300" testo="archiviata" />
      </div>
    </Card>
  )
}

function Legenda({ colore, testo }: { colore: string; testo: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('h-3 w-3 rounded border-2 border-black', colore)} />
      <span className="text-[10px] font-bold uppercase tracking-wide text-gray-600">{testo}</span>
    </span>
  )
}

function descrizione(stato: StatoGiornata): string {
  if (stato === 'rosso') return 'Giornata da chiudere'
  if (stato === 'giallo') return 'Inviata, in attesa del titolare'
  if (stato === 'azzurro') return 'Validata dal titolare'
  if (stato === 'verde') return 'Archiviata: la giornata è chiusa'
  return 'Nessuna scheda'
}

/* Il salto di mese passa per il primo del mese, non per il giorno in
   cui ti trovi: da «31 marzo indietro di un mese» non esiste il 31
   febbraio, e la data scivolerebbe. Un giorno prima del primo di questo
   mese e' l'ultimo del mese scorso; un giorno dopo l'ultimo di questo
   e' il primo del prossimo. */
const primoDelMese = (g: string) => `${g.slice(0, 7)}-01`

function meseIndietro(g: string): string {
  return primoDelMese(giornoPiu(primoDelMese(g), -1))
}

function meseAvanti(g: string): string {
  // +31 da un primo del mese cade sempre nel mese successivo, mai oltre:
  // nessun mese ha piu' di 31 giorni.
  return primoDelMese(giornoPiu(primoDelMese(g), 31))
}
