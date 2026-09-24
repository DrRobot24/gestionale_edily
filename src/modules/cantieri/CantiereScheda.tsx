import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { Avviso, Badge, Button, Card, Percorso, Visore, cn, type Scatto } from '../../ui'
import { data as fmtData, dataEstesa, euro } from '../../lib/formato'
import { usePermission } from '../auth/usePermission'
import { useSession } from '../auth/SessionProvider'
import { oggi, versoHome } from '../rapportini/campiRapportino'
import { StatoRapportino } from '../rapportini/stato'
import { useFotoCantiere } from '../rapportini/useFoto'
import {
  useRapportiniCantiere,
  type RapportinoCantiere,
} from '../rapportini/useRapportini'
import { assegnazioneInCorso, useAssegnazioni, useMembri } from './assegnazioni'
import { RiquadroDocumenti } from '../documenti/RiquadroDocumenti'
import { RiquadroFigure } from '../anagrafiche/RiquadroFigure'
import { CalendarioCantiere } from './CalendarioCantiere'
import { useCantiere } from './cantieri'
import { RiquadroClienti } from './RiquadroClienti'
import { useClientiCantiere } from './clientiCantiere'
import { RiquadroNoteContabili } from './RiquadroNoteContabili'
import { StatoCantiere } from './stato'

/* ══════════════════════════════════════════════════════════════════
   La scheda del cantiere: la tappa in mezzo.

   Prima di questa pagina il percorso del tecnico era di due passi — la
   card in home, e subito dentro il form del rapportino. Voleva dire
   scrivere un documento su un cantiere senza averlo mai guardato.

   Qui in mezzo ci sta la panoramica: chi ci lavora, cosa e' successo nei
   giorni scorsi, che aspetto aveva, quando e' cominciato. Il rapportino
   parte da qui, quando chi compila ha visto abbastanza.

   Il giorno di lavoro vive nell'indirizzo (`?data=`), non in uno stato
   interno: cosi' si puo' mandare a un collega il link della giornata
   giusta, e tornando indietro dal rapportino non si perde il giorno che
   si stava guardando.

   Cosa questa pagina NON e': il modulo dell'anagrafica. Quello sta su
   `/cantieri/:id/modifica` e lo apre chi ha `cantieri.write`. Qui non si
   scrive niente, e infatti la RLS lascia entrare chiunque abbia il
   cantiere fra i suoi.
   ══════════════════════════════════════════════════════════════════ */

export function CantiereScheda() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { app } = useSession()

  const puoModificare = usePermission('cantieri.write')
  // Chi ha l'elenco dei cantieri in menu ci e' passato per arrivare qui.
  const vedeElenco = usePermission('cantieri.read_all')
  /* Chi assegna e' anche l'unico a cui serve LEGGERE la squadra qui:
     vedi il commento sul riquadro piu' sotto. */
  const puoAssegnare = usePermission('cantieri.assign')
  /* I documenti li carica chi tiene le anagrafiche, non chi assegna: e'
     lavoro d'ufficio, non di cantiere. */
  const puoScrivereAnagrafiche = usePermission('anagrafiche.write')
  const puoCompilare = usePermission('rapportini.create')
  // Le note contabili le scrivono il tecnico sui cantieri suoi e il
  // titolare ovunque. `rapportini.validate` e' il modo di dire "il
  // titolare" in permessi: owner e admin ce l'hanno, amministrazione no.
  const eIlTitolare = usePermission('rapportini.validate')
  const vedeSoldi = usePermission('economics.read')

  const { data: c, isPending, error } = useCantiere(id)
  const { data: rapportini, isPending: caricoSchede } = useRapportiniCantiere(id)
  const { data: altriClienti } = useClientiCantiere(id)

  const giorno = params.get('data') ?? oggi()
  const cambiaGiorno = (nuovo: string) => {
    const p = new URLSearchParams(params)
    p.set('data', nuovo)
    setParams(p, { replace: true })
  }

  if (isPending) return <p className="text-sm font-bold text-gray-600">Carico il cantiere…</p>

  /* Un cantiere non assegnato non e' "non trovato" per errore: e' la RLS
     che fa il suo mestiere. Dirlo cosi' evita di far cercare un guasto
     dove c'e' una regola. */
  if (error) {
    return (
      <div className="mx-auto grid max-w-3xl gap-4">
        <Avviso tono="errore">
          Non riesco ad aprire questo cantiere. O non esiste, o non sei assegnato: in quel caso
          il permesso lo dà chi tiene l&rsquo;anagrafica.
        </Avviso>
        <div>
          <Button onClick={() => navigate(versoHome(giorno))}>Torna alla home</Button>
        </div>
      </div>
    )
  }

  const cliente = Array.isArray(c.clienti) ? c.clienti[0] : c.clienti
  // Nella testa tutti i clienti, il principale per primo: con due
  // comproprietari, scriverne uno solo farebbe sembrare l'altro un
  // ospite. Il dettaglio sta nel riquadro «I clienti».
  const nomiClienti = [
    cliente?.ragione_sociale,
    ...(altriClienti ?? []).filter((a) => a.clienteId !== c.cliente_id).map((a) => a.nome),
  ].filter(Boolean)
  const luogo = [c.indirizzo, c.comune && `${c.comune}${c.provincia ? ` (${c.provincia})` : ''}`]
    .filter(Boolean)
    .join(' — ')

  const delGiorno = piuAvanti((rapportini ?? []).filter((r) => r.data === giorno))

  return (
    <div className="mx-auto grid max-w-7xl gap-4">
      {/* ── testa ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {/* Il passo indietro dipende da COME ci sei arrivato, che qui
              coincide con chi sei. Il tecnico entra dalle card della
              home e li' deve tornare; chi tiene l'anagrafica entra
              dall'elenco dei cantieri, e mandarlo in home sarebbe un
              passo indietro in un posto dove non era. */}
          <Percorso
            indietro={
              vedeElenco ? { etichetta: 'Cantieri', a: '/cantieri' } : { etichetta: 'Home', a: versoHome(giorno) }
            }
            qui={[
              { etichetta: 'Cantieri', a: vedeElenco ? '/cantieri' : undefined },
              { etichetta: c.codice },
            ]}
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-extrabold leading-tight text-black">
              {c.denominazione}
            </h1>
            <StatoCantiere stato={c.stato} />
          </div>
          <p className="text-sm font-semibold text-gray-600">
            {c.codice}
            {nomiClienti.length > 0 && ` · ${nomiClienti.join(', ')}`}
            {luogo && ` · ${luogo}`}
          </p>
          {/* «Chi lavora qui» LO VEDE SOLO CHI ASSEGNA, e la storia di
              questo dato dice una regola del progetto.

              Il 2026-09-15 l'utente ha chiesto di toglierlo: «se vede
              quel cantiere vuol dire che gli e' stato assegnato, quindi
              e' una ripetizione». Vero — PER IL TECNICO, che vede solo i
              cantieri suoi e ci trova scritto il proprio nome. L'ho
              tolto per tutti, ed era sbagliato: poche ore dopo lo stesso
              utente ha notato che dal punto di vista del titolare era
              sparita un'informazione che gli serve. Giuseppe vede TUTTI
              i cantieri dell'impresa ed e' lui che assegna i tecnici:
              per lui la squadra non e' una ripetizione, e' il dato su
              cui decide.

              La regola generale: **ogni profilo ha una schermata
              diversa**, e «questa informazione e' inutile» va sempre
              chiesto «a chi». Il cancello e' `cantieri.assign`.

              DAL 2026-09-24 E' UN BADGE IN TESTA, non piu' un riquadro in
              mezzo alla pagina: «mettilo fuori da qualche parte in
              maniera piu' graziosa», perche' lo spazio centrale va alle
              figure del cantiere. E' un'informazione da leggere di
              passaggio, e sta accanto al nome del cantiere e al cliente,
              che sono dello stesso genere. */}
          {puoAssegnare && <SquadraInTesta cantiereId={id!} />}
        </div>

        {puoModificare && (
          <Button onClick={() => navigate(`/cantieri/${id}/modifica`)}>
            Modifica anagrafica
          </Button>
        )}
      </div>

      <FasciaGiornata
        cantiereId={id!}
        giorno={giorno}
        onCambiaGiorno={cambiaGiorno}
        rapportino={delGiorno}
        caricando={caricoSchede}
        cantiereAttivo={c.stato === 'attivo'}
        puoCompilare={puoCompilare}
        mioUserId={app?.userId}
      />

      {/* Due pile indipendenti, non celle di una griglia sola: le righe
          di una griglia sono condivise, e una colonna piu' alta
          lascerebbe buchi bianchi nell'altra. Sul telefono le pile si
          impilano, quindi l'ordine qui sotto e' anche l'ordine di
          lettura sul telefono. */}
      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <div className="grid gap-4 lg:col-span-2">
          {/* ══ LE FIGURE DEL CANTIERE ══
              Direttore Lavori, coordinatori della sicurezza, collaudo:
              sono NOMINATI PER QUEST'OPERA, non appartengono al
              cliente. Lo stesso condominio che fa due interventi in
              anni diversi puo' avere due DL diversi, e il CSE e' per
              definizione il coordinatore *di questo cantiere*.

              Il tecnico le LEGGE, ed e' una scelta piu' larga che sui
              documenti: il DL e il CSE sono le persone che in cantiere
              incontra, e un numero di telefono che sta nel gestionale
              ma non si legge dal posto dove serve finisce su un
              foglietto. */}
          {/* NEL CENTRO DELLA PAGINA dal 2026-09-24, al posto della
              squadra: «lo spazio centrale vorrei dedicarlo alle figure
              apicali, il Direttore Lavori, l'Amministratore». Sono le
              persone con cui il cantiere si parla, e prima stavano in
              fondo alla colonna stretta sotto le foto. */}
          <RiquadroFigure
            ambito="cantiere"
            riferimentoId={id!}
            puoScrivere={puoScrivereAnagrafiche}
          />

          {/* Sopra il calendario di proposito. Il calendario dice cosa
              e' successo; questa dice dove sta il lavoro adesso, ed e'
              la domanda che ci si fa aprendo la pagina. Il passato
              viene dopo il presente. */}
          <RiquadroNoteContabili cantiereId={id!} puoScrivere={puoCompilare || eIlTitolare} />

          <CalendarioCantiere
            righe={rapportini ?? []}
            caricando={caricoSchede}
            giorno={giorno}
            onScegliGiorno={cambiaGiorno}
          />
        </div>

        <div className="grid gap-4">
          {/* In cima alla colonna: per chi e' il lavoro e' la prima
              cosa che si chiede di un cantiere, dopo come si chiama. */}
          <RiquadroClienti
            cantiereId={id!}
            principale={
              c.cliente_id && cliente
                ? { id: c.cliente_id, nome: cliente.ragione_sociale, telefono: cliente.telefono }
                : null
            }
            puoScrivere={puoModificare}
            vedeAnagrafica={puoScrivereAnagrafiche}
          />
          <Anagrafica cantiere={c} vedeSoldi={vedeSoldi} />
          <FotoDelCantiere cantiereId={id!} />
          {/* I documenti di questo cantiere: computi, disegni,
              permessi, verbali. Stanno qui e non in una pagina di menu,
              decisione del 2026-09-10: un documento di cantiere
              appartiene a UN cantiere, e in un elenco generale la prima
              cosa da fare sarebbe filtrarlo per cantiere — cioe' rifare
              a mano il raggruppamento che la scheda gia' offre.

              Il tecnico li LEGGE, e la RLS glielo concede solo sui
              cantieri suoi. Carica e cancella chi tiene le anagrafiche:
              alla Edily Stefania e il titolare. */}
          <RiquadroDocumenti
            ambito="cantiere"
            riferimentoId={id!}
            puoScrivere={puoScrivereAnagrafiche}
          />
          {c.note && (
            <Card className="grid gap-2 p-5">
              <h2 className="text-lg font-extrabold text-black">Note del cantiere</h2>
              <p className="whitespace-pre-wrap text-sm font-semibold text-gray-800">{c.note}</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── la giornata ───────────────────────────────────────────────── */

/**
 * La fascia che dice a che punto e' il giorno scelto, e da cui parte il
 * rapportino.
 *
 * Sta in cima e non in fondo di proposito. La panoramica serve a
 * guardare prima di scrivere, ma nascondere il pulsante sotto tre
 * riquadri non fa guardare di piu': fa scorrere. Il colore e' lo stesso
 * semaforo delle card in home, cosi' il verde vuol dire la stessa cosa
 * nelle due schermate.
 */
function FasciaGiornata({
  cantiereId,
  giorno,
  onCambiaGiorno,
  rapportino,
  caricando,
  cantiereAttivo,
  puoCompilare,
  mioUserId,
}: {
  cantiereId: string
  giorno: string
  onCambiaGiorno: (v: string) => void
  rapportino: RapportinoCantiere | undefined
  caricando: boolean
  cantiereAttivo: boolean
  puoCompilare: boolean
  mioUserId: string | undefined
}) {
  const navigate = useNavigate()

  // Serve solo alla scheda NUOVA, che il cantiere non ce l'ha ancora
  // scritto dentro: una volta salvata, e da ogni scheda gia' esistente,
  // il rapportino sa da se' a quale cantiere e a quale giorno torna.
  // Riporta al giorno che si stava guardando, non a oggi: chi recupera
  // il rapportino di ieri non deve ricercarselo a mano appena esce.
  const ritorno = encodeURIComponent(`/cantieri/${cantiereId}?data=${giorno}`)

  const respinto = rapportino?.stato === 'respinto'
  const mio = rapportino?.compilato_da === mioUserId
  const fascia = !rapportino ? 'bg-rose-100' : respinto ? 'bg-yellow-100' : 'bg-lime-100'

  return (
    <Card className={cn('grid gap-4 p-5 lg:grid-cols-2 lg:items-center', fascia)}>
      <div className="grid gap-2">
        <label className="grid gap-1.5">
          <span className="text-[11px] font-extrabold uppercase tracking-wide text-black">
            Giornata di lavoro
          </span>
          <input
            type="date"
            value={giorno}
            max={oggi()}
            onChange={(e) => e.target.value && onCambiaGiorno(e.target.value)}
            className="w-full max-w-56 rounded-xl border-2 border-black bg-white px-4 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </label>
        <p className="text-sm font-bold capitalize text-black">{dataEstesa(giorno)}</p>
      </div>

      <div className="grid gap-3">
        {caricando ? (
          <p className="text-sm font-bold text-gray-600">Guardo se c&rsquo;è già la scheda…</p>
        ) : !rapportino ? (
          <>
            <p className="text-sm font-bold text-black">
              Per questa giornata non c&rsquo;è ancora nessuna scheda.
            </p>
            {puoCompilare ? (
              <div>
                <Button
                  variante="primario"
                  onClick={() =>
                    navigate(
                      `/rapportini/nuovo?cantiere=${cantiereId}&data=${giorno}&ritorno=${ritorno}`,
                    )
                  }
                >
                  Compila il rapportino
                </Button>
                {!cantiereAttivo && (
                  <p className="mt-2 text-xs font-semibold text-gray-700">
                    Attenzione: questo cantiere non è in stato «attivo», quindi non entra nel
                    conto del foglio di giornata.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs font-semibold text-gray-700">
                I rapportini li compila chi ha il permesso di scriverli.
              </p>
            )}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <StatoRapportino stato={rapportino.stato} />
              {rapportino.numero && (
                <Badge className="px-2 py-0.5 text-[10px]">
                  n. {rapportino.numero}/{rapportino.anno}
                </Badge>
              )}
              {rapportino.nessuna_attivita && (
                <Badge className="px-2 py-0.5 text-[10px]">nessuna attività</Badge>
              )}
            </div>

            {respinto && rapportino.motivo_rifiuto && (
              <Avviso tono="errore">
                <strong>Da correggere:</strong> {rapportino.motivo_rifiuto}
              </Avviso>
            )}

            {/* UN PULSANTE SOLO, che porta dove serve adesso.

                Fino al 2026-09-17 ce n'erano due: «Apri la scheda del
                giorno» verso la lettura e, sul respinto, «Correggi»
                verso il form. Destinazioni diverse — quindi non un
                doppione tecnico — ma chi guardava doveva scegliere fra
                due pulsanti vicini senza niente che dicesse in cosa
                differiscono. E la scorciatoia era di troppo comunque:
                dentro la scheda in lettura c'e' gia' «Modifica».

                Su una scheda RESPINTA la domanda e' una sola — come la
                sistemo — e il motivo del rifiuto sta scritto qui sopra:
                chi lo ha appena letto vuole il form, non un'altra
                pagina che glielo ripete. Negli altri stati si va in
                lettura, che e' il posto da cui si puo' fare tutto. */}
            <div className="flex flex-wrap gap-2">
              <Button
                variante={respinto ? 'primario' : 'secondario'}
                onClick={() =>
                  navigate(
                    respinto && mio && puoCompilare
                      ? `/rapportini/${rapportino.id}/modifica`
                      : `/rapportini/${rapportino.id}`,
                  )
                }
              >
                {respinto && mio && puoCompilare ? 'Correggi la scheda' : 'Apri la scheda del giorno'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  )
}

/* ── squadra ───────────────────────────────────────────────────── */

/**
 * Chi e' assegnato al cantiere, come badge sotto il titolo.
 *
 * Solo le assegnazioni in corso: quelle chiuse sono storia, e la storia
 * si legge nel modulo dell'anagrafica. In una panoramica farebbero
 * sembrare in squadra chi non c'e' piu'.
 *
 * Il badge porta al modulo, dove le assegnazioni si cambiano: e' li'
 * che va chi guarda la squadra per decidere. Il «dal» sta nel tooltip,
 * perche' si cerca raramente e occuperebbe meta' del badge.
 */
function SquadraInTesta({ cantiereId }: { cantiereId: string }) {
  const navigate = useNavigate()
  const { data: assegnazioni, isPending } = useAssegnazioni(cantiereId)
  const { data: membri, error: erroreMembri } = useMembri()

  if (isPending) return null
  const inCorso = (assegnazioni ?? []).filter((a) => assegnazioneInCorso(a))
  const gestisci = () => navigate(`/cantieri/${cantiereId}/modifica`)

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {inCorso.length === 0 ? (
        <button
          type="button"
          onClick={gestisci}
          className="cursor-pointer rounded-full border-2 border-dashed border-gray-400 px-3 py-0.5 text-xs font-bold text-gray-600 hover:border-black hover:text-black"
        >
          Nessuno assegnato — assegna
        </button>
      ) : (
        inCorso.map((a) => {
          const m = membri?.find((x) => x.userId === a.user_id)
          return (
            <button
              key={a.id}
              type="button"
              onClick={gestisci}
              title={`Assegnato dal ${fmtData(a.dal)} — premi per gestire la squadra`}
              className="neo-press flex cursor-pointer items-center gap-2 rounded-full border-2 border-black bg-amber-100 py-0.5 pr-3 pl-1 text-xs font-bold text-black shadow-neo-xs"
            >
              <span className="rounded-full bg-black px-2 py-px text-[10px] font-black uppercase tracking-wide text-amber-300">
                {a.ruolo_cantiere}
              </span>
              {/* Se l'elenco dei membri non e' arrivato non si scrive
                  "utente non piu' in azienda": sarebbe una bugia detta
                  con sicurezza. Si dice che il nome manca. */}
              {m?.nome ?? (erroreMembri ? 'Nome non disponibile' : '…')}
            </button>
          )
        })
      )}
    </div>
  )
}

/* ── anagrafica e foto ─────────────────────────────────────────── */

function Anagrafica({
  cantiere,
  vedeSoldi,
}: {
  cantiere: {
    data_inizio: string | null
    data_fine_prevista: string | null
    data_fine_effettiva: string | null
    importo_contratto: number | null
  }
  vedeSoldi: boolean
}) {
  return (
    <Card className="grid gap-3 p-5">
      <h2 className="text-lg font-extrabold text-black">Il cantiere</h2>
      <dl className="grid gap-2">
        <Dato etichetta="Inizio" valore={fmtData(cantiere.data_inizio)} />
        <Dato etichetta="Fine prevista" valore={fmtData(cantiere.data_fine_prevista)} />
        {cantiere.data_fine_effettiva && (
          <Dato etichetta="Fine effettiva" valore={fmtData(cantiere.data_fine_effettiva)} />
        )}
        {/* L'importo di contratto passa da `economics.read`: al tecnico
            che compila le ore non serve, e non e' una sua informazione. */}
        {vedeSoldi && (
          <Dato etichetta="Contratto" valore={euro(cantiere.importo_contratto)} />
        )}
      </dl>
    </Card>
  )
}

function Dato({ etichetta, valore }: { etichetta: string; valore: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b-2 border-dashed border-gray-300 pb-1.5 last:border-0">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-gray-600">{etichetta}</dt>
      <dd className="text-sm font-extrabold text-black">{valore}</dd>
    </div>
  )
}

/**
 * Le foto del cantiere, CHIUSE fino a che non si chiedono.
 *
 * Prima si aprivano tutte insieme, in una griglia a tre colonne. Su un
 * cantiere vero le foto sono centinaia — una giornata di lavoro ne
 * produce cinque o sei — e una panoramica che ne carica cento non e' una
 * panoramica: e' un salasso, come l'ha chiamato l'utente il 2026-09-15.
 * Ogni immagine e' una richiesta al server, e in cantiere si guarda dal
 * telefono col campo che va e viene.
 *
 * Quindi qui resta solo il FATTO che ci sono, e quante: chi vuole
 * vederle le chiede. Chiuso il riquadro costa una riga di testo; aperto
 * mostra le piu' recenti, non tutte, perche' oltre un certo numero
 * l'utilita' finisce e resta il peso.
 *
 * Si aggiungono dal rapportino del giorno, che e' l'unico posto dove una
 * foto ha una data che vuol dire qualcosa. Lo dice anche quando sono
 * zero, altrimenti sembra che manchi il pulsante per caricarle.
 */
const FOTO_MOSTRATE = 12

function FotoDelCantiere({ cantiereId }: { cantiereId: string }) {
  // Due cose diverse, e si somigliano nel nome: `aperto` e' il pannello
  // dispiegato, `aperta` e' quale foto si sta guardando nel visore.
  const [aperto, setAperto] = useState(false)
  const [aperta, setAperta] = useState<number | null>(null)
  const { data: foto, isPending, error } = useFotoCantiere(cantiereId)

  if (error) {
    return (
      <Card className="grid gap-2 p-5">
        <h2 className="text-lg font-extrabold text-black">Foto</h2>
        <Avviso tono="errore">Non riesco a leggere le foto: {error.message}</Avviso>
      </Card>
    )
  }

  const quante = foto?.length ?? 0
  const mostrate = (foto ?? []).slice(0, FOTO_MOSTRATE)

  /* Solo quelle con un indirizzo valido: una firma scaduta darebbe una
     finestra nera, e gli indici del visore devono contarsi su cio' che
     si puo' sfogliare davvero, non sulle righe. */
  const visibili = mostrate.filter((f) => f.url)
  const scatti: Scatto[] = visibili.map((f) => ({
    url: f.url!,
    titolo: f.didascalia,
    sottotitolo: f.giorno ? `Scattata il ${fmtData(f.giorno)}` : null,
  }))

  return (
    <Card className="overflow-hidden">
      {/* Tutta la testa e' il comando, non solo una freccina: da telefono
          un bersaglio grande e' la differenza fra aprirlo e riprovarci. */}
      <button
        type="button"
        onClick={() => setAperto((v) => !v)}
        disabled={isPending || quante === 0}
        aria-expanded={aperto}
        className={cn(
          'flex w-full flex-wrap items-center justify-between gap-2 px-5 py-4 text-left',
          quante > 0 && 'neo-press cursor-pointer hover:bg-amber-50',
        )}
      >
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold text-black">Foto</h2>
          <p className="text-xs font-semibold text-gray-600">
            {isPending
              ? 'Carico…'
              : quante === 0
                ? 'Nessuna. Si aggiungono dal rapportino della giornata.'
                : `${quante} ${quante === 1 ? 'foto' : 'foto'} su questo cantiere`}
          </p>
        </div>

        {quante > 0 && (
          <span className="flex shrink-0 items-center gap-2">
            <Badge className="px-2.5 py-1 text-xs">{quante}</Badge>
            <span
              aria-hidden="true"
              className="rounded-lg border-2 border-black bg-white px-2 py-0.5 text-sm font-extrabold"
            >
              {aperto ? '−' : '+'}
            </span>
          </span>
        )}
      </button>

      {aperto && quante > 0 && (
        <div className="border-t-2 border-black p-4">
          <ul className="grid grid-cols-3 gap-2">
            {mostrate.map((f) => (
              <li key={f.id}>
                {f.url ? (
                  <button
                    type="button"
                    onClick={() => setAperta(visibili.findIndex((v) => v.id === f.id))}
                    title={f.giorno ? `Scattata il ${fmtData(f.giorno)}` : 'Apri la foto'}
                    className="neo-press block aspect-square w-full cursor-zoom-in overflow-hidden rounded-xl border-2 border-black bg-gray-100"
                  >
                    <img
                      src={f.url}
                      alt={f.didascalia ?? 'Foto del cantiere'}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </button>
                ) : (
                  <div className="flex aspect-square items-center justify-center rounded-xl border-2 border-black bg-gray-100 px-1 text-center text-[10px] font-bold text-gray-500">
                    non visibile
                  </div>
                )}
              </li>
            ))}
          </ul>

          {quante > mostrate.length && (
            <p className="mt-3 text-xs font-semibold text-gray-600">
              Ci sono altre {quante - mostrate.length} foto più vecchie. Si vedono aprendo il
              rapportino della giornata in cui sono state scattate.
            </p>
          )}

          {/* Si sfogliano solo le dodici mostrate, non tutte quelle del
              cantiere: il visore sfoglia cio' che si sta guardando, e
              caricare centinaia di indirizzi firmati per una finestra
              che se ne usa tre sarebbe una promessa cara da mantenere. */}
          <Visore
            scatti={scatti}
            indice={aperta}
            onChiudi={() => setAperta(null)}
            onVai={setAperta}
          />
        </div>
      )}
    </Card>
  )
}

/* ── util ──────────────────────────────────────────────────────── */

const ORDINE: Record<string, number> = {
  bozza: 0,
  respinto: 1,
  inviato: 2,
  validato: 3,
  contabilizzato: 4,
}

/**
 * Se per lo stesso giorno esistesse piu' di una scheda vince quella piu'
 * avanti nel flusso. E' la stessa regola delle card in home, e serve a
 * non far sembrare da compilare una giornata gia' inviata per colpa di
 * una bozza dimenticata.
 */
function piuAvanti(righe: RapportinoCantiere[]): RapportinoCantiere | undefined {
  if (righe.length === 0) return undefined
  return righe.reduce((a, b) => (ORDINE[b.stato] > ORDINE[a.stato] ? b : a))
}
