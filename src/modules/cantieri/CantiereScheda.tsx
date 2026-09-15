import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { Avviso, Badge, Button, Card, Percorso, Vuoto, cn } from '../../ui'
import { data as fmtData, dataEstesa, euro } from '../../lib/formato'
import { usePermission } from '../auth/usePermission'
import { useSession } from '../auth/SessionProvider'
import { oggi } from '../rapportini/campiRapportino'
import { StatoRapportino } from '../rapportini/stato'
import { useFotoCantiere } from '../rapportini/useFoto'
import {
  useRapportiniCantiere,
  type RapportinoCantiere,
} from '../rapportini/useRapportini'
import { assegnazioneInCorso, useAssegnazioni, useMembri } from './assegnazioni'
import { CalendarioCantiere } from './CalendarioCantiere'
import { useCantiere } from './cantieri'
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
  const puoCompilare = usePermission('rapportini.create')
  // Le note contabili le scrivono il tecnico sui cantieri suoi e il
  // titolare ovunque. `rapportini.validate` e' il modo di dire "il
  // titolare" in permessi: owner e admin ce l'hanno, amministrazione no.
  const eIlTitolare = usePermission('rapportini.validate')
  const vedeSoldi = usePermission('economics.read')

  const { data: c, isPending, error } = useCantiere(id)
  const { data: rapportini, isPending: caricoSchede } = useRapportiniCantiere(id)

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
          <Button onClick={() => navigate('/')}>Torna alla home</Button>
        </div>
      </div>
    )
  }

  const cliente = Array.isArray(c.clienti) ? c.clienti[0] : c.clienti
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
              vedeElenco ? { etichetta: 'Cantieri', a: '/cantieri' } : { etichetta: 'Home', a: '/' }
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
            {cliente?.ragione_sociale && ` · ${cliente.ragione_sociale}`}
            {luogo && ` · ${luogo}`}
          </p>
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
          {/* «Chi lavora qui» LO VEDE SOLO CHI ASSEGNA, e la storia di
              questo riquadro dice una regola del progetto.

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

              La regola generale, che vale oltre questo riquadro: **ogni
              profilo ha una schermata diversa**, e «questa informazione
              e' inutile» va sempre chiesto «a chi». Il cancello e'
              `cantieri.assign` perche' chi assegna e' esattamente chi
              deve sapere chi c'e' gia'. */}
          {puoAssegnare && <SquadraAssegnata cantiereId={id!} />}

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
          <Anagrafica cantiere={c} vedeSoldi={vedeSoldi} />
          <FotoDelCantiere cantiereId={id!} />
          <Documenti />
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

  // Il ritorno riporta al giorno che si stava guardando, non a oggi:
  // chi recupera il rapportino di ieri non deve ricercarselo a mano
  // appena esce.
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

            <div className="flex flex-wrap gap-2">
              <Button
                variante={respinto ? 'primario' : 'secondario'}
                onClick={() => navigate(`/rapportini/${rapportino.id}?ritorno=${ritorno}`)}
              >
                Apri la scheda del giorno
              </Button>
              {respinto && mio && puoCompilare && (
                <Button
                  onClick={() =>
                    navigate(`/rapportini/${rapportino.id}/modifica?ritorno=${ritorno}`)
                  }
                >
                  Correggi
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  )
}

/* ── squadra ───────────────────────────────────────────────────── */

/**
 * Chi e' assegnato oggi, in sola lettura.
 *
 * Lo monta solo chi ha `cantieri.assign` — owner e admin — perche' e'
 * l'unico a cui dice qualcosa: vede tutti i cantieri dell'impresa ed e'
 * lui che decide chi ci va. Al tecnico, che vede solo i cantieri
 * assegnati a lui, ripeterebbe il suo stesso nome.
 *
 * Non riusa il componente `Squadra`: quello e' una tabella larga con
 * assegna, termina e riapri, e vive giustamente dentro il modulo
 * dell'anagrafica. Qui serve l'altra meta' della domanda — chi ci
 * lavora — senza le leve per cambiarla.
 *
 * Restano solo le assegnazioni in corso. Quelle chiuse sono storia, e la
 * storia si legge nel modulo: in una panoramica farebbero sembrare in
 * squadra chi non c'e' piu'.
 */
function SquadraAssegnata({ cantiereId }: { cantiereId: string }) {
  const navigate = useNavigate()
  const { data: assegnazioni, isPending } = useAssegnazioni(cantiereId)
  const { data: membri, error: erroreMembri } = useMembri()

  const inCorso = (assegnazioni ?? []).filter((a) => assegnazioneInCorso(a))

  return (
    <Card className="grid gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold text-black">Chi lavora qui</h2>
          <p className="text-xs font-semibold text-gray-600">
            Assegnazioni in corso. Chi è in questo elenco vede il cantiere e può compilarci i
            rapportini.
          </p>
        </div>
        <Button dimensione="sm" onClick={() => navigate(`/cantieri/${cantiereId}/modifica`)}>
          Gestisci
        </Button>
      </div>

      {isPending ? (
        <p className="text-sm font-bold text-gray-600">Carico la squadra…</p>
      ) : inCorso.length === 0 ? (
        <Vuoto>Nessuno è assegnato a questo cantiere in questo momento.</Vuoto>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {inCorso.map((a) => {
            const m = membri?.find((x) => x.userId === a.user_id)
            return (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 rounded-xl border-2 border-black bg-amber-50 px-3 py-2"
              >
                <div className="min-w-0">
                  {/* Se l'elenco dei membri non e' arrivato non si scrive
                      "utente non piu' in azienda": sarebbe una bugia
                      detta con sicurezza. Si dice che il nome manca. */}
                  <p className="truncate text-sm font-bold text-black">
                    {m?.nome ?? (erroreMembri ? 'Nome non disponibile' : '…')}
                  </p>
                  <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                    {a.ruolo_cantiere}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] font-semibold text-gray-600">
                  dal {fmtData(a.dal)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
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
  const [aperto, setAperto] = useState(false)
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
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    title={f.giorno ? `Scattata il ${fmtData(f.giorno)}` : undefined}
                    className="neo-press block aspect-square overflow-hidden rounded-xl border-2 border-black bg-gray-100"
                  >
                    <img
                      src={f.url}
                      alt={f.didascalia ?? 'Foto del cantiere'}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </a>
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
        </div>
      )}
    </Card>
  )
}

/**
 * I documenti di questo cantiere.
 *
 * Stanno qui e non in una pagina di menu, ed e' una decisione presa il
 * 2026-09-10: un documento di cantiere e' quasi sempre un PDF che
 * appartiene a UN cantiere. In un elenco generale la prima cosa da fare
 * sarebbe filtrarlo per cantiere, cioe' rifare a mano il raggruppamento
 * che il cantiere gia' offre.
 *
 * Segnaposto per ora, e lo dice: il bucket `rapportini` accetta solo
 * immagini, quindi i PDF ne vogliono uno loro che non e' ancora stato
 * creato. Meglio un riquadro che dichiara di essere vuoto in attesa, che
 * un riquadro che non c'e' e lascia credere che la cosa non sia
 * prevista.
 */
function Documenti() {
  return (
    <Card className="grid gap-2 border-dashed p-5">
      <h2 className="text-lg font-extrabold text-gray-500">Documenti</h2>
      <p className="text-sm font-semibold text-gray-600">
        Qui andranno i documenti di questo cantiere: computi, disegni, permessi, verbali.
        Lo spazio dove conservarli non è ancora stato creato, quindi per adesso non si
        carica niente.
      </p>
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
