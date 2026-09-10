import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { supabase } from '../../lib/supabase'
import { Avviso, Button, Card, cn } from '../../ui'
import { useSession } from '../auth/SessionProvider'
import { useCantieri } from '../cantieri/useCantieri'
import { useRapportini, type Rapportino } from '../rapportini/useRapportini'
import { oggi } from '../rapportini/campiRapportino'
import { data as formattaData } from '../../lib/formato'
import { ControlloOre } from './ControlloOre'

/* ══════════════════════════════════════════════════════════════════
   La giornata del tecnico, un cantiere per card.

   La regola di Edily e' che la giornata si chiude solo quando OGNI
   cantiere attivo ha la sua scheda — anche quello dove non si e'
   lavorato, perche' "nessuna attivita'" e' un'informazione, non
   un'assenza di informazione. Finche' una casella e' rossa, il foglio
   di riepilogo della giornata non parte.

   Da qui il semaforo: non racconta lo stato del rapportino per
   curiosita', dice quanto manca alla fine della giornata.

     rosso   nessuna scheda: e' qui che va il tecnico adesso
     giallo  respinta dal titolare, da rilavorare: e' l'unica cosa che
             blocca la partenza quando le caselle sono tutte piene
     verde   pronta — compilata, o dichiarata senza attivita'

   Nota che una bozza e' VERDE. Da quando l'invio e' collettivo non e'
   piu' lavoro lasciato a meta': e' una scheda finita che aspetta le
   sorelle, e sara' il pulsante in fondo a farle partire tutte insieme.

   Guarda solo i cantieri `attivo`: uno sospeso o chiuso non chiede
   niente a nessuno, e tenerlo nell'elenco spegnerebbe il senso del
   contatore.
   ══════════════════════════════════════════════════════════════════ */

type Semaforo = 'rosso' | 'giallo' | 'verde'

const ASPETTO: Record<Semaforo, { punto: string; fascia: string; testo: string }> = {
  rosso: { punto: 'bg-rose-500', fascia: 'bg-rose-300', testo: 'Da compilare' },
  giallo: { punto: 'bg-yellow-400', fascia: 'bg-yellow-300', testo: 'Respinta' },
  verde: { punto: 'bg-lime-500', fascia: 'bg-lime-300', testo: 'Pronta' },
}

/**
 * Una bozza compilata e' VERDE, non gialla.
 *
 * Da quando l'invio e' collettivo, la bozza non e' lavoro lasciato a
 * meta': e' una scheda finita che aspetta le altre. Il giallo serve per
 * cio' che il titolare ha rimandato indietro, che e' l'unica cosa che
 * puo' bloccare la partenza del foglio quando le caselle sono piene.
 */
function semaforoDi(r: Rapportino | undefined): Semaforo {
  if (!r) return 'rosso'
  if (r.stato === 'respinto') return 'giallo'
  return 'verde'
}

export function CantieriDelGiorno() {
  const navigate = useNavigate()
  const { org } = useSession()
  const qc = useQueryClient()
  const giorno = oggi()

  /**
   * L'invio passa da una funzione del database, non da una serie di
   * update dal browser. Due motivi: e' una cosa sola, o partono tutte le
   * schede o nessuna; e la regola "solo quando sono tutte pronte" deve
   * valere anche per chi chiama l'API direttamente, non solo per chi usa
   * questo pulsante.
   *
   * Gli errori del database (P0001) sono gia' scritti in italiano e
   * dicono quante schede mancano: li mostriamo com'e' invece di
   * riscriverli peggio.
   */
  const invia = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('invia_foglio_giornata', {
        p_org: org!.id,
        p_giorno: giorno,
      })
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rapportini'] })
    },
  })

  const { data: cantieri, isPending: caricoCantieri, error: erroreCantieri } = useCantieri()
  const { data: rapportini, isPending: caricoRapportini } = useRapportini()

  if (caricoCantieri || caricoRapportini) {
    return <p className="text-sm font-bold text-gray-600">Carico la giornata…</p>
  }
  if (erroreCantieri) {
    return <Avviso tono="errore">Non riesco a leggere i cantieri: {erroreCantieri.message}</Avviso>
  }

  const attivi = (cantieri ?? []).filter((c) => c.stato === 'attivo')

  if (attivi.length === 0) {
    return (
      <Avviso tono="info">
        Nessun cantiere attivo assegnato a te: oggi non c&rsquo;è niente da compilare.
      </Avviso>
    )
  }

  // Il rapportino di OGGI per quel cantiere. Se per errore ce ne fosse
  // piu' d'uno vince quello piu' avanti nel flusso, cosi' una bozza
  // dimenticata non fa sembrare rossa una giornata gia' inviata.
  const ordine: Record<string, number> = {
    bozza: 0,
    respinto: 1,
    inviato: 2,
    validato: 3,
    contabilizzato: 4,
  }
  const diOggi = new Map<string, Rapportino>()
  for (const r of rapportini ?? []) {
    if (r.data !== giorno || !r.cantiere_id) continue
    const presente = diOggi.get(r.cantiere_id)
    if (!presente || ordine[r.stato] > ordine[presente.stato]) diOggi.set(r.cantiere_id, r)
  }

  const schede = attivi.map((c) => {
    const r = diOggi.get(c.id)
    return { cantiere: c, rapportino: r, semaforo: semaforoDi(r) }
  })

  const fatte = schede.filter((s) => s.semaforo === 'verde').length
  const complete = fatte === schede.length
  // Se sono tutte gia' partite non c'e' piu' niente da spedire: il
  // pulsante resterebbe acceso a non fare nulla.
  const daSpedire = schede.some((s) => s.rapportino?.stato === 'bozza')

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-black">
            La tua giornata — {formattaData(giorno)}
          </h2>
          <p className="text-xs font-semibold text-gray-600">
            Ogni cantiere attivo vuole la sua scheda, anche quelli fermi.
          </p>
        </div>

        <Avanzamento fatte={fatte} totale={schede.length} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {schede.map(({ cantiere, semaforo }) => (
          <SchedaCantiere
            key={cantiere.id}
            codice={cantiere.codice}
            denominazione={cantiere.denominazione}
            luogo={
              cantiere.comune
                ? `${cantiere.comune}${cantiere.provincia ? ` (${cantiere.provincia})` : ''}`
                : null
            }
            semaforo={semaforo}
            /* La card porta al CANTIERE, non dritta al rapportino.
               Prima saltava questa tappa e si finiva a compilare un
               documento su un cantiere mai guardato: chi ci lavora
               vuole prima vedere la squadra, i giorni gia' fatti e le
               foto, e decidere dopo. Il giorno viaggia nell'indirizzo,
               cosi' la scheda si apre gia' sulla giornata giusta. */
            onApri={() => navigate(`/cantieri/${cantiere.id}?data=${giorno}`)}
          />
        ))}
      </div>

      {/* Le ore non tornano? Si vede qui, un attimo prima di decidere
          se mandare. Dopo l'invio sarebbe una segnalazione inutile: il
          foglio e' gia' sul tavolo del titolare. */}
      <ControlloOre giorno={giorno} />

      {invia.isError && <Avviso tono="errore">{(invia.error as Error).message}</Avviso>}
      {invia.isSuccess && (
        <Avviso tono="successo">
          Foglio della giornata inviato al titolare: {invia.data} schede.
        </Avviso>
      )}

      <Card
        className={cn(
          'flex flex-wrap items-center justify-between gap-3 p-4',
          complete ? 'bg-lime-100' : 'bg-white',
        )}
      >
        <p className="text-sm font-bold text-black">{riepilogo(schede.length, fatte, daSpedire)}</p>
        <Button
          variante="primario"
          disabled={!complete || !daSpedire || invia.isPending}
          onClick={() => invia.mutate()}
        >
          {invia.isPending ? 'Invio…' : 'Invia il foglio della giornata'}
        </Button>
      </Card>
    </div>
  )
}

/** Una riga sola che dice a che punto sei e, se sei fermo, cosa manca:
 *  un contatore senza spiegazione lascia indovinare perche' il pulsante
 *  non si accende. */
function riepilogo(totale: number, fatte: number, daSpedire: boolean): string {
  if (fatte < totale) {
    const mancano = totale - fatte
    return mancano === 1
      ? 'Manca una scheda prima di poter mandare la giornata.'
      : `Mancano ${mancano} schede prima di poter mandare la giornata.`
  }
  if (!daSpedire) return 'La giornata è già partita: tutte le schede sono dal titolare.'
  return 'Tutte le schede sono pronte: la giornata può partire.'
}

/* ── pezzi ─────────────────────────────────────────────────────── */

function Avanzamento({ fatte, totale }: { fatte: number; totale: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1">
        {Array.from({ length: totale }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-2.5 w-6 rounded-full border-2 border-black',
              i < fatte ? 'bg-lime-400' : 'bg-white',
            )}
          />
        ))}
      </div>
      <span className="text-sm font-extrabold text-black">
        {fatte}/{totale}
      </span>
    </div>
  )
}

function SchedaCantiere({
  codice,
  denominazione,
  luogo,
  semaforo,
  onApri,
}: {
  codice: string
  denominazione: string
  luogo: string | null
  semaforo: Semaforo
  onApri: () => void
}) {
  const a = ASPETTO[semaforo]

  return (
    <Card className="overflow-hidden">
      <div className={cn('flex items-center gap-2 border-b-2 border-black px-4 py-2', a.fascia)}>
        <span className={cn('h-3 w-3 rounded-full border-2 border-black', a.punto)} />
        <span className="text-[11px] font-extrabold uppercase tracking-wide text-black">
          {a.testo}
        </span>
      </div>

      <div className="grid gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-gray-600">{codice}</p>
          <p className="truncate text-base font-extrabold leading-tight text-black">
            {denominazione}
          </p>
          {luogo && <p className="truncate text-xs font-semibold text-gray-600">{luogo}</p>}
        </div>

        {/* Un'etichetta sola per tutti e tre i colori: il bottone porta
            sempre nello stesso posto, e scrivergli sopra «Compila»
            prometterebbe un modulo mentre si apre una panoramica. Cosa
            c'e' da fare lo dice gia' la fascia colorata qui sopra. */}
        <Button
          variante={semaforo === 'verde' ? undefined : 'primario'}
          dimensione="sm"
          onClick={onApri}
          className="w-full"
        >
          Apri il cantiere
        </Button>
      </div>
    </Card>
  )
}
