import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { supabase } from '../../lib/supabase'
import { Avviso, Button, Card, cn } from '../../ui'
import { dataEstesa } from '../../lib/formato'
import { nomeNonFeriale, ultimoFeriale } from '../../lib/giorni'
import { useSession } from '../auth/SessionProvider'
import { useCantieri } from '../cantieri/useCantieri'
import { useRapportini, type Rapportino } from '../rapportini/useRapportini'
import { oggi } from '../rapportini/campiRapportino'
import { useMioDipendente } from '../anagrafiche/dipendenti'
import { useGiornataPersonale, totaleOre } from '../oreproprie/orePersonali'
import { AssentiDelGiorno } from './AssentiDelGiorno'

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

type Semaforo = 'rosso' | 'giallo' | 'scritta' | 'verde'

const ASPETTO: Record<Semaforo, { punto: string; fascia: string; testo: string }> = {
  rosso: { punto: 'bg-rose-500', fascia: 'bg-rose-300', testo: 'Da compilare' },
  giallo: { punto: 'bg-yellow-400', fascia: 'bg-yellow-300', testo: 'Respinta' },
  /* SCRITTA MA NON PARTITA, dal 2026-09-22. Prima era verde «Pronta»
     come una scheda gia' dal titolare, e per quasi tutto il tempo la
     differenza non si vedeva: si compilava e si mandava di seguito.

     Ma il 21 settembre Zito ha avuto sette card verdi e «7/7» su una
     giornata che non era mai partita — l'etichetta diceva «hai finito»
     a chi non aveva mandato niente. Notato dall'utente guardando la
     home: «ci sono cose incomplete non per colpa degli utenti ma del
     programma che non avvisava gli utenti a fare cosa».

     L'ambra e' scelta apposta fra il rosso e il verde: non e' un
     errore — il lavoro e' fatto — ma non e' nemmeno finito. */
  scritta: { punto: 'bg-amber-500', fascia: 'bg-amber-300', testo: 'Scritta, da inviare' },
  verde: { punto: 'bg-lime-500', fascia: 'bg-lime-300', testo: 'Inviata' },
}

/**
 * Quattro stati, non tre.
 *
 * Fino al 2026-09-22 una bozza era VERDE come una scheda gia' partita,
 * col ragionamento che da quando l'invio e' collettivo la bozza non e'
 * lavoro a meta' ma una scheda finita che aspetta le sorelle. Vero
 * finche' la giornata parte in giornata; falso appena resta ferma —
 * e allora sette card verdi dicono «fatto» a chi non ha mandato niente.
 *
 * Adesso `scritta` (ambra) e `verde` (inviata) sono cose diverse, e il
 * contatore in alto conta le SECONDE. Il giallo resta per cio' che il
 * titolare ha rimandato indietro.
 */
function semaforoDi(r: Rapportino | undefined): Semaforo {
  if (!r) return 'rosso'
  if (r.stato === 'respinto') return 'giallo'
  if (r.stato === 'bozza') return 'scritta'
  return 'verde'
}

export function CantieriDelGiorno({
  giorno,
  onCambiaGiorno,
}: {
  giorno: string
  /** Serve al pulsante del weekend, che riporta all'ultimo giorno
   *  feriale. Facoltativa: senza, il pulsante non compare. */
  onCambiaGiorno?: (giorno: string) => void
}) {
  const navigate = useNavigate()
  const { org } = useSession()
  const qc = useQueryClient()

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

  /* Le ore di chi compila. Un tecnico che gira i cantieri lavora come
     tutti, e una giornata in cui l'unica persona certa di esserci stata
     non compare non e' il resoconto di quella giornata.

     SI GUARDA IL FOGLIO PERSONALE, non `rapportino_ore`. Il tecnico non
     sta nella squadra di nessun cantiere — «e' come un uccello che vola
     sui cantieri», 2026-09-18 — quindi cercarlo li' lo troverebbe
     sempre mancante e il messaggio lo manderebbe a fare la cosa
     sbagliata. E' lo stesso posto in cui guarda il database dentro
     `invia_foglio_giornata`, dopo `invio-due-posti.sql`: qui si
     anticipa la sua risposta, non se ne inventa un'altra.

     Vale solo per chi ha un'anagrafica collegata al suo utente: senza,
     non esisterebbe una riga dove scrivere quelle ore, e pretenderle
     bloccherebbe l'invio senza via d'uscita.

     `oreLette` non e' pignoleria: se la lettura fallisce, `data` e'
     undefined e senza quel controllo risulterebbe che le ore mancano
     sempre. Meglio non bloccare qui e lasciare rispondere il database. */
  const { data: mio } = useMioDipendente()
  const { data: miaGiornata, isSuccess: oreLette } = useGiornataPersonale(giorno)
  /* Una riga da zero ore non conta come compilata: e' il caso di chi
     apre il foglio, non scrive niente e lo salva. Il database fa lo
     stesso conto. */
  const mancanoLeMieOre =
    Boolean(mio) && oreLette && !(miaGiornata && totaleOre(miaGiornata) > 0)

  if (caricoCantieri || caricoRapportini) {
    return <p className="text-sm font-bold text-gray-600">Carico la giornata…</p>
  }
  if (erroreCantieri) {
    return <Avviso tono="errore">Non riesco a leggere i cantieri: {erroreCantieri.message}</Avviso>
  }

  /* SABATO E DOMENICA NON SI COMPILA. Chiesto dall'utente il
     2026-09-21: «le giornate si svolgono solo ed esclusivamente nei
     giorni feriali quindi LUN - VEN. Lascia i giorni prefestivi (SAB) e
     festivi (DOM) esenti».

     Il controllo sta PRIMA di tutto il resto: senza, il sabato la home
     mostrerebbe sette card rosse da compilare e il pulsante d'invio,
     cioe' chiederebbe un lavoro che non esiste. E chiedere ogni sabato
     una cosa che non si deve fare insegna a ignorare quella zona della
     schermata anche nei giorni in cui chiede sul serio.

     Non e' un divieto, e' un'assenza di richiesta: le frecce nella
     fascia restano e chi ha davvero lavorato di sabato passa dalla
     scheda del cantiere, dove il rapportino si compila come sempre. */
  const nonFeriale = nomeNonFeriale(giorno)
  if (nonFeriale) {
    return (
      <Card className="bg-gray-50 p-5">
        <p className="text-sm font-extrabold text-black">
          {nonFeriale === 'domenica' ? 'Domenica' : 'Sabato'}: niente da compilare.
        </p>
        <p className="mt-1 text-xs font-semibold text-gray-600">
          Le giornate si registrano dal lunedì al venerdì. Se si è lavorato lo stesso,
          il rapportino si compila dalla scheda del cantiere.
        </p>
        <div className="mt-3">
          <Button
            dimensione="sm"
            variante="secondario"
            onClick={() => onCambiaGiorno?.(ultimoFeriale(giorno))}
          >
            Vai all&rsquo;ultimo giorno feriale
          </Button>
        </div>
      </Card>
    )
  }

  const attivi = (cantieri ?? []).filter((c) => c.stato === 'attivo')

  if (attivi.length === 0) {
    return (
      <Avviso tono="info">
        Nessun cantiere attivo assegnato a te: oggi non c&rsquo;è niente da compilare.
      </Avviso>
    )
  }

  // Il rapportino del GIORNO GUARDATO per quel cantiere. Se per errore
  // ce ne fosse piu' d'uno vince quello piu' avanti nel flusso, cosi'
  // una bozza dimenticata non fa sembrare rossa una giornata inviata.
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

  /* DUE CONTI DIVERSI, e tenerli separati e' il punto.

     `compilate` = c'e' una scheda, scritta o partita. E' cio' che
     serve a sapere se la giornata PUO' partire.
     `inviate`   = e' davvero dal titolare. E' cio' che il contatore in
     alto mostra, perche' «7/7» deve voler dire «consegnate», non
     «scritte». */
  const compilate = schede.filter(
    (s) => s.semaforo === 'verde' || s.semaforo === 'scritta',
  ).length
  const inviate = schede.filter((s) => s.semaforo === 'verde').length
  const complete = compilate === schede.length
  // Se sono tutte gia' partite non c'e' piu' niente da spedire: il
  // pulsante resterebbe acceso a non fare nulla.
  const daSpedire = schede.some((s) => s.rapportino?.stato === 'bozza')

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {/* Il titolo dice OGGI solo quando e' oggi. Da quando si
              sfoglia il calendario, «I cantieri di oggi» su una giornata
              di tre giorni fa e' semplicemente falso, e chi ci lavora
              sopra crede di star compilando la giornata di adesso. */}
          <h2 className="text-lg font-extrabold capitalize text-black">
            {giorno === oggi() ? 'I cantieri di oggi' : `I cantieri di ${dataEstesa(giorno)}`}
          </h2>
          <p className="text-xs font-semibold text-gray-600">
            Ogni cantiere attivo vuole la sua scheda, anche quelli fermi.
          </p>
        </div>

        <Avanzamento inviate={inviate} compilate={compilate} totale={schede.length} />
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

      {/* Il controllo delle ore stava QUI, fra le card e il pulsante di
          invio: era il posto giusto finche' compariva solo quando
          qualcosa non tornava — un attimo prima di decidere se mandare.
          Dal 2026-09-15 vive accanto al calendario e dice il totale
          anche quando le ore quadrano, quindi e' diventato un riquadro
          fisso e non un avviso: infilarlo qui spezzerebbe la sequenza
          «guarda le schede, poi mandale». */}

      {/* Chi non c'era: dopo le card, prima dell'invio. Si blocca
          appena il titolare ha firmato una scheda del giorno, come nel
          database (`app.giornata_validata`). */}
      <AssentiDelGiorno
        giorno={giorno}
        bloccata={schede.some(
          (s) => s.rapportino?.stato === 'validato' || s.rapportino?.stato === 'contabilizzato',
        )}
      />

      {/* `whitespace-pre-line` non e' un dettaglio estetico: il rifiuto
          per le ore che non tornano elenca una persona per riga, e in
          HTML gli a capo si perdono. Senza, sei nomi diventano un muro
          di testo su una riga sola, cioe' proprio la cosa che l'elenco
          serviva a evitare. */}
      {invia.isError && (
        <Avviso tono="errore" className="whitespace-pre-line">
          {(invia.error as Error).message}
        </Avviso>
      )}
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
        <p className="text-sm font-bold text-black">
          {mancanoLeMieOre && complete
            ? 'Mancano le tue ore: dichiara quante ne hai lavorate in questa giornata.'
            : riepilogo(schede.length, compilate, daSpedire)}
        </p>
        {/* Quando a bloccare sono le proprie ore, il pulsante che serve
            non e' quello dell'invio: e' la strada per andare a
            scriverle. Dirlo senza darla obbliga a cercare la voce in
            sidebar mentre si e' fermi qui. */}
        {mancanoLeMieOre && complete && (
          <Button dimensione="sm" onClick={() => navigate(`/mie-ore?data=${giorno}`)}>
            Compila le tue ore
          </Button>
        )}
        <Button
          variante="primario"
          disabled={!complete || !daSpedire || mancanoLeMieOre || invia.isPending}
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
function riepilogo(totale: number, compilate: number, daSpedire: boolean): string {
  if (compilate < totale) {
    const mancano = totale - compilate
    return mancano === 1
      ? 'Manca una scheda prima di poter mandare la giornata.'
      : `Mancano ${mancano} schede prima di poter mandare la giornata.`
  }
  if (!daSpedire) return 'La giornata è già partita: tutte le schede sono dal titolare.'
  /* «NON E' ANCORA PARTITA» e non «può partire»: la seconda descrive
     una possibilita', la prima dice che manca qualcosa. Su una giornata
     rimasta ferma per giorni, «può partire» si legge come una nota di
     colore e si scorre oltre. */
  return 'Le schede sono tutte scritte, ma la giornata NON è ancora partita.'
}

/* ── pezzi ─────────────────────────────────────────────────────── */

/**
 * L'avanzamento a tre stati: inviate, scritte, mancanti.
 *
 * IL NUMERO GRANDE CONTA LE INVIATE, non le compilate. Prima contava
 * tutto cio' che aveva una scheda, e su una giornata scritta e mai
 * partita diceva «7/7»: un punteggio pieno per un lavoro non
 * consegnato. Chi lo legge smette di cercare altro, ed e' esattamente
 * cosi' che il 21 settembre e' rimasto fermo.
 *
 * Le scritte non spariscono: sono pallini ambra, e la scritta sotto le
 * nomina. Cosi' si legge in un colpo «ne ho fatte sette, ne ho mandate
 * zero», che e' la frase vera di quella giornata.
 */
function Avanzamento({
  inviate,
  compilate,
  totale,
}: {
  inviate: number
  compilate: number
  totale: number
}) {
  const scritte = compilate - inviate

  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1">
        {Array.from({ length: totale }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-2.5 w-6 rounded-full border-2 border-black',
              i < inviate ? 'bg-lime-400' : i < compilate ? 'bg-amber-400' : 'bg-white',
            )}
          />
        ))}
      </div>
      <div className="text-right">
        <span className="text-sm font-extrabold text-black">
          {inviate}/{totale}
        </span>
        {scritte > 0 && (
          <span className="block text-[10px] font-bold uppercase leading-none text-amber-800">
            +{scritte} da inviare
          </span>
        )}
      </div>
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
