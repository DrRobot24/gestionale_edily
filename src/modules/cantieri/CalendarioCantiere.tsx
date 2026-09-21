import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Card, cn } from '../../ui'
import { eFineSettimana } from '../../lib/giorni'
import { griglieDelMese, giornoPiu, meseEAnno, numero } from '../../lib/formato'
import { oggi } from '../rapportini/campiRapportino'
import type { RapportinoCantiere } from '../rapportini/useRapportini'

/* ══════════════════════════════════════════════════════════════════
   I giorni lavorati su QUESTO cantiere, a calendario.

   Ha preso il posto di «Giorni già lavorati», che era un elenco di
   quindici righe con data, persone, ore e stato — e poi una frase che
   diceva «ce ne sono altre più vecchie, cercale nei rapportini». Su un
   cantiere di sei mesi quell'elenco non era una panoramica: era l'inizio
   di un archivio. Detto dall'utente il 2026-09-15, come per la home.

   Il semaforo e' lo stesso di tutto il progetto, ma qui la domanda e'
   diversa: non «la giornata dell'impresa e' completa» — questo e' UN
   cantiere, e di schede per giorno ce n'e' una sola — ma «a che punto e'
   la scheda di quel giorno»:

     giallo  scritta e non ancora partita, o rimandata indietro dal
             titolare: chiede ancora qualcosa a qualcuno
     verde   validata o contabilizzata: chiusa
     grigio  nessuna attivita' dichiarata — il cantiere era fermo, ed e'
             un'informazione, non un buco

   Un giorno senza scheda resta BIANCO: su un cantiere non si lavora
   tutti i giorni, e colorare di rosso ogni domenica e ogni giorno in cui
   la squadra era altrove trasformerebbe il calendario in un muro rosso
   che non dice niente. Il rosso di «manca la scheda» vive in home, dove
   la domanda e' «la giornata di oggi e' completa».

   Cliccando un giorno con la scheda si apre quella scheda. Cliccando un
   giorno vuoto si porta la fascia in cima a quella data, che e' da dove
   si compila: il calendario non e' solo da guardare.
   ══════════════════════════════════════════════════════════════════ */

type Stato = 'vuoto' | 'giallo' | 'verde' | 'fermo'

const COLORE: Record<Exclude<Stato, 'vuoto'>, string> = {
  giallo: 'bg-yellow-300',
  verde: 'bg-lime-300',
  fermo: 'bg-gray-300',
}

const INIZIALI = ['L', 'M', 'M', 'G', 'V', 'S', 'D']

function statoDi(r: RapportinoCantiere | undefined): Stato {
  if (!r) return 'vuoto'
  if (r.nessuna_attivita) return 'fermo'
  if (r.stato === 'validato' || r.stato === 'contabilizzato') return 'verde'
  return 'giallo'
}

export function CalendarioCantiere({
  righe,
  caricando,
  giorno,
  onScegliGiorno,
}: {
  righe: RapportinoCantiere[]
  caricando: boolean
  /** Il giorno aperto nella fascia in cima: si evidenzia anche qui. */
  giorno: string
  onScegliGiorno: (g: string) => void
}) {
  const navigate = useNavigate()
  const [mese, setMese] = useState(giorno)

  const perGiorno = new Map<string, RapportinoCantiere>()
  for (const r of righe) perGiorno.set(r.data, r)

  const celle = griglieDelMese(mese)
  const adesso = oggi()

  /* Le ore del mese guardato, non di tutto il cantiere: il numero in
     cima deve parlare di cio' che si sta guardando, altrimenti cambiando
     mese resta fermo e sembra rotto. */
  const delMese = righe.filter((r) => r.data.slice(0, 7) === mese.slice(0, 7))
  const oreMese = delMese.reduce((totale, r) => {
    const presenti = (r.rapportino_ore ?? []).filter((o) => !o.tipo_assenza)
    return (
      totale +
      presenti.reduce(
        (t, o) => t + Number(o.ore_ordinarie ?? 0) + Number(o.ore_straordinarie ?? 0),
        0,
      )
    )
  }, 0)

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-black bg-sky-100 px-5 py-3">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-black">
          Giorni lavorati
        </h2>
        <span className="rounded-full border-2 border-black bg-white px-2.5 py-0.5 text-xs font-extrabold">
          {righe.length} in tutto
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 border-b-2 border-black px-4 py-2">
        <button
          type="button"
          aria-label="Mese precedente"
          onClick={() => setMese(meseIndietro(mese))}
          className="neo-press rounded-lg border-2 border-black bg-white px-3 py-1 text-sm font-extrabold"
        >
          ‹
        </button>

        <div className="text-center">
          <p className="text-sm font-extrabold capitalize text-black">{meseEAnno(mese)}</p>
          {delMese.length > 0 && (
            <p className="text-[11px] font-semibold text-gray-600">
              {delMese.length} {delMese.length === 1 ? 'giornata' : 'giornate'}
              {oreMese > 0 && <> · <span className="numerico">{numero(oreMese)}</span> ore</>}
            </p>
          )}
        </div>

        <button
          type="button"
          aria-label="Mese successivo"
          disabled={mese.slice(0, 7) >= adesso.slice(0, 7)}
          onClick={() => setMese(meseAvanti(mese))}
          className="neo-press rounded-lg border-2 border-black bg-white px-3 py-1 text-sm font-extrabold disabled:cursor-not-allowed disabled:text-gray-300"
        >
          ›
        </button>
      </div>

      {caricando ? (
        <p className="px-5 py-4 text-sm font-bold text-gray-600">Carico le giornate…</p>
      ) : (
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

            const r = perGiorno.get(cella)
            const stato = statoDi(r)
            const scelto = cella === giorno
            const futuro = cella > adesso
            /* Sabato e domenica: non sono giornate da compilare, e si
               riconoscono a colpo d'occhio invece di far contare le
               colonne. Il grigio dice «non ti riguarda», non «errore»
               — quello sarebbe il rosso. */
            const nonFeriale = eFineSettimana(cella)

            return (
              <button
                key={cella}
                type="button"
                disabled={futuro}
                title={cella === adesso ? `Oggi — ${titolo(stato)}` : titolo(stato)}
                /* Con la scheda si va a leggerla; senza, si porta la
                   fascia in cima su quel giorno — che e' il posto da cui
                   si compila. */
                onClick={() =>
                  r ? navigate(`/rapportini/${r.id}`) : onScegliGiorno(cella)
                }
                /* Altezza FISSA e non `aspect-square`: la casella
                   quadrata seguiva la larghezza della colonna, e nella
                   scheda del cantiere — dove il calendario occupa due
                   terzi della pagina — diventava una griglia alta quanto
                   lo schermo per dire trenta numeri. Qui l'informazione
                   e' il colore del giorno, e per quella bastano due
                   righe di testo. */
                className={cn(
                  'relative h-9 rounded-lg border-2 text-xs font-bold',
                  stato === 'vuoto'
                    ? nonFeriale
                      ? 'bg-gray-200 text-gray-500'
                      : 'bg-white'
                    : COLORE[stato],
                  scelto ? 'border-black ring-2 ring-black ring-offset-1' : 'border-black/30',
                  futuro
                    ? 'cursor-not-allowed text-gray-300'
                    : 'neo-press cursor-pointer text-black hover:border-black',
                )}
              >
                {Number(cella.slice(8, 10))}
                {/* Su una casella bassa la parola "oggi" non ci sta piu'
                    sotto il numero: diventa un punto nell'angolo, che
                    dice la stessa cosa occupando niente. Il `title` del
                    bottone la nomina per esteso. */}
                {cella === adesso && (
                  <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-black" />
                )}
              </button>
            )
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t-2 border-black bg-gray-50 px-4 py-2">
        <Voce colore="bg-yellow-300" testo="da chiudere" />
        <Voce colore="bg-lime-300" testo="validata" />
        <Voce colore="bg-gray-300" testo="cantiere fermo" />
      </div>
    </Card>
  )
}

function Voce({ colore, testo }: { colore: string; testo: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('h-3 w-3 rounded border-2 border-black', colore)} />
      <span className="text-[10px] font-bold uppercase tracking-wide text-gray-600">{testo}</span>
    </span>
  )
}

function titolo(stato: Stato): string {
  if (stato === 'giallo') return 'Scheda da chiudere'
  if (stato === 'verde') return 'Validata dal titolare'
  if (stato === 'fermo') return 'Nessuna attività: cantiere fermo'
  return 'Nessuna scheda — clicca per compilarla'
}

/* Il salto di mese passa dal primo del mese: da «31 marzo indietro di un
   mese» non esiste il 31 febbraio e la data scivolerebbe. */
const primoDelMese = (g: string) => `${g.slice(0, 7)}-01`
const meseIndietro = (g: string) => primoDelMese(giornoPiu(primoDelMese(g), -1))
const meseAvanti = (g: string) => primoDelMese(giornoPiu(primoDelMese(g), 31))
