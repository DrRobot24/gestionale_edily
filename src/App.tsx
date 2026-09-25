import type { ReactNode } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Outlet } from 'react-router'
import { SessionProvider, useSession } from './modules/auth/SessionProvider'
import { RequireAuth, RequirePermission } from './modules/auth/guards'
import { LoginPage } from './modules/auth/LoginPage'
import { MuroWip } from './modules/wip/MuroWip'
import { CantieriPage } from './modules/cantieri/CantieriPage'
import { CantiereForm } from './modules/cantieri/CantiereForm'
import { CantiereScheda } from './modules/cantieri/CantiereScheda'
import { RapportiniPage } from './modules/rapportini/RapportiniPage'
import { NuovoRapportino } from './modules/rapportini/NuovoRapportino'
import { RapportinoPage } from './modules/rapportini/RapportinoPage'
import { ModificaRapportino } from './modules/rapportini/ModificaRapportino'
import { DipendentiPage } from './modules/anagrafiche/DipendentiPage'
import { ClientiPage } from './modules/anagrafiche/ClientiPage'
import { ClienteForm } from './modules/anagrafiche/ClienteForm'
import { FornitoriPage } from './modules/anagrafiche/FornitoriPage'
import { FornitoreForm } from './modules/anagrafiche/FornitoreForm'
import { Dashboard } from './modules/home/Dashboard'
import { EconomiaPage } from './modules/economia/EconomiaPage'
import { MagazzinoPage } from './modules/magazzino/MagazzinoPage'
import { MieOrePage } from './modules/oreproprie/MieOrePage'
import { RiepilogoEconomicoPage } from './modules/paghe/RiepilogoEconomicoPage'
import { OrePeriodoPage } from './modules/ore/OrePeriodoPage'
import { useOreDaLeggere } from './modules/ore/useOreDaLeggere'
import { DipendenteForm } from './modules/anagrafiche/DipendenteForm'
import { EconomiaRisorsaPage } from './modules/anagrafiche/EconomiaRisorsaPage'
import { useMioDipendente } from './modules/anagrafiche/dipendenti'
import type { Permission } from './modules/auth/session'
import { env } from './lib/env'
import logoEncreade from './assets/logo-encreade.png'
import { Button, Card, cn } from './ui'

/**
 * Una sola lista per il menu E per le rotte.
 *
 * Prima il link ai Rapportini era sempre visibile mentre la rotta era
 * protetta da `rapportini.create`: chi non aveva il permesso vedeva la
 * voce, cliccava, e sbatteva contro un 403. Tenere insieme "dove si va"
 * e "chi ci puo' andare" fa sparire quella classe di disallineamenti:
 * non esiste piu' un posto dove aggiornarne uno e dimenticarsi l'altro.
 */
type Voce = {
  to: string
  etichetta: string
  /** Una lista vuol dire OR: basta averne uno. */
  perm?: Permission | Permission[]
  /**
   * Il cancello che NON e' un permesso: «hai una scheda in anagrafica
   * collegata a questa utenza».
   *
   * Serve a «Le mie ore» e non si poteva esprimere con `perm` perche'
   * non e' un privilegio: e' un fatto anagrafico. Chi lavora qui
   * dichiara le proprie ore, punto — non perche' gli sia stato
   * concesso qualcosa.
   *
   * Quando c'e', si somma al permesso in OR: entra chi ha il permesso
   * OPPURE chi ha la scheda.
   */
  seHaScheda?: boolean
  elemento: ReactNode
}

/**
 * Le anagrafiche stanno in menu a chi le tiene, non a chi le legge.
 *
 * Clienti, Operai, Cantieri e Fornitori sono registri che alla Edily
 * compila l'amministrazione. Il tecnico non ci mette mano: i cantieri li
 * trova come card in home, gia' filtrati sui suoi, e gli operai li
 * sceglie dalla tendina dentro il rapportino. Lasciargli in menu quattro
 * elenchi che puo' solo guardare vuol dire fargli cercare la voce giusta
 * fra sette invece che fra quattro.
 *
 * Al tecnico restano Home, Rapportini, Documenti e Subappalti: le
 * quattro cose che fa davvero.
 *
 * I cancelli sono quelli che dicono la stessa cosa nel linguaggio dei
 * permessi, non il nome di un ruolo:
 *
 *   Cantieri              cantieri.read_all — la pagina mostra TUTTI i
 *                         cantieri dell'impresa, quindi la vede chi
 *                         puo' vederli tutti. Al tecnico la RLS ne
 *                         mostrerebbe comunque solo i suoi, che sono
 *                         gia' in home.
 *   Clienti, Operai,      anagrafiche.write — chi tiene il registro
 *   Fornitori
 *
 * ATTENZIONE a cosa NON e' questa riga: non e' sicurezza. Chi non ha il
 * permesso non vede la voce e non apre la rotta, ma cio' che protegge
 * davvero i dati resta la RLS. Se un domani si volesse far vedere al
 * tecnico l'elenco cantieri, si rimette il cancello e non cambia niente
 * di cio' che puo' leggere.
 *
 * Rapportini sta su `rapportini.create`, e la storia di questa riga vale
 * raccontarla perche' e' cambiata due volte. Prima era cosi', poi il
 * cancello e' stato tolto: `amministrazione` ha `rapportini.read_all`
 * proprio per leggerli, e il permesso di CREARE non e' il permesso di
 * LEGGERE. Ragionamento giusto sulla carta.
 *
 * Provato in ufficio il 2026-09-15, l'utente ha detto il contrario: a
 * Stefania — che tiene l'amministrazione — i rapportini NON interessano.
 * Lei riceve le ore e le elabora per le paghe, e la vista che le serve e'
 * il totale per persona, non l'elenco dei documenti di cantiere. Una voce
 * di menu che non usera' mai e' peso, non possibilita'.
 *
 * Quindi la voce la vedono quelli che i rapportini li scrivono o li
 * validano. Quando esistera' la vista delle ore per persona, quella andra'
 * in menu al posto suo — e sara' quella la porta dell'amministrazione sui
 * dati dei rapportini.
 *
 * Il cancello e' in OR dal 2026-09-17, e prima era solo
 * `rapportini.create`. Finche' l'owner aveva ANCHE quel permesso i due
 * insiemi coincidevano e nessuno se ne accorgeva; tolto a Giuseppe —
 * «lui solo vede, valida o respinge» — la voce sarebbe sparita proprio
 * a chi i rapportini li deve leggere per firmarli. Il pulsante «Nuovo
 * rapportino» dentro la pagina resta su `create`, dove e' sempre stato:
 * il diritto di LEGGERE non e' il diritto di SCRIVERE.
 *
 * L'ORDINE DELLE VOCI e' quello dell'importanza dichiarata dall'utente il
 * 2026-09-15: Clienti, Cantieri, Operai, poi il resto. Segue il percorso
 * vero del lavoro in ufficio — prima il committente, poi il cantiere che
 * gli appartiene, poi chi ci va a lavorare — che e' anche l'ordine in cui
 * le cose DEVONO essere inserite, perche' un cantiere senza cliente non
 * si crea.
 */
const VOCI: Voce[] = [
  { to: '/', etichetta: 'Home', elemento: <Dashboard /> },

  /* Le tre anagrafiche in testa, nell'ordine dell'importanza dichiarata
     dall'utente: e' anche l'ordine obbligato di inserimento, perche' un
     cantiere vuole il suo cliente e una squadra vuole le sue risorse. */
  {
    to: '/anagrafiche/clienti',
    etichetta: 'Clienti',
    perm: 'anagrafiche.write',
    elemento: <ClientiPage />,
  },
  {
    to: '/cantieri',
    etichetta: 'Cantieri',
    perm: 'cantieri.read_all',
    elemento: <CantieriPage />,
  },
  {
    /* «Risorse» e non «Operai» dal 2026-09-18: qui dentro ci sono anche
       tecnici e impiegati, e la voce di menu prometteva una cosa sola
       per poi aprirne tre. Il PERCORSO resta `/anagrafiche/operai`
       perche' gli indirizzi girano e stanno nei preferiti: cambiarlo
       romperebbe i segnalibri per guadagnare una parola nell'URL che
       nessuno legge. */
    to: '/anagrafiche/operai',
    etichetta: 'Risorse',
    perm: 'anagrafiche.write',
    elemento: <DipendentiPage />,
  },

  {
    to: '/rapportini',
    etichetta: 'Rapportini',
    perm: ['rapportini.create', 'rapportini.validate'],
    elemento: <RapportiniPage />,
  },

  /* «Le mie ore» sta su `rapportini.create`, dal 2026-09-18.

     PRIMA NON AVEVA CANCELLO, e il ragionamento era questo: il cancello
     giusto sarebbe «hai una scheda personale collegata a questa
     utenza», che non e' un permesso ma un fatto da interrogare in
     `dipendenti` — una query nel menu per ogni pagina caricata. Meglio
     lasciar spiegare alla pagina, che senza scheda dice cosa fare e a
     chi chiederlo.

     Regge ancora per chi la scheda non ce l'ha ANCORA. Non reggeva per
     il titolare: dal momento in cui gli si e' tolto `rapportini.create`
     — «Giuseppe e' owner e non compila un cazzo», 2026-09-17 — lui non
     presta ore per definizione, e quella voce gli offriva un foglio da
     compilare che nessuno gli avrebbe mai chiesto. Notato dall'utente
     guardando la home da titolare, subito dopo aver tolto l'invio.

     `rapportini.create` e non il ruolo: e' esattamente il permesso di
     chi lavora sul campo, e vale da se' per qualunque impresa futura
     senza che nessuno debba ricordarsi un'eccezione su «owner». */
  /* DAL 2026-09-22 IL CANCELLO E' LA SCHEDA, non `rapportini.create`.

     Il permesso descriveva chi va in cantiere, non chi lavora — e
     Stefania non ce l'ha da quando i rapportini sono usciti dal suo
     menu (2026-09-15). Risultato: non aveva NESSUNA strada per
     dichiarare le proprie ore, e la sua riga nel foglio presenze
     restava a zero per sempre. Proprio la riga vuota che `/ore` e'
     fatto per far notare, e che nessuno poteva chiudere.

     E' lo stesso buco delle ore del tecnico trovato il 2026-09-22, un
     anello piu' a monte: li' mancava chi le firmava, qui mancava chi le
     poteva scrivere.

     Il cancello giusto e' anagrafico — «esisti come persona in questa
     impresa» — e vale da se' per ogni impiegato futuro senza eccezioni
     da ricordare. Il titolare resta fuori lo stesso, ma per il motivo
     vero: non ha una scheda dipendente, perche' non presta ore.
     Prima ci restava per via di un permesso che gli era stato tolto
     per un'altra ragione, il che funzionava per caso. */
  {
    to: '/mie-ore',
    etichetta: 'Le mie ore',
    seHaScheda: true,
    elemento: <MieOrePage />,
  },

  /* LE ORE DI TUTTI, per settimana. E' l'altro capo del flusso dei
     rapportini, e chiude un buco che avevamo aperto noi: il 2026-09-15 i
     rapportini sono usciti dal menu dell'amministrazione — a Stefania
     non interessano, provato in ufficio — ma il sostituto non c'era, e
     da allora non aveva nessuna strada per leggere le ore da elaborare.

     `paghe.read` trova qui il suo primo impiego: esiste in
     `role_permissions` dai tempi di wbs-office e non era mai stato usato
     in nessun punto del frontend. Ce l'hanno owner, admin e
     amministrazione — verificato sul database il 2026-09-21.

     NON e' in OR con `rapportini.create` come Economia: li' il tecnico
     entra perche' quelle note le scrive lui. Qui dentro ci sono le ore
     di tutti i colleghi, che sono il presupposto delle buste paga, e il
     perimetro per assegnazione non c'entra niente — la funzione e'
     `security definer` apposta. Chi compila non deve leggere le ore
     degli altri. */
  {
    to: '/ore',
    etichetta: 'Foglio presenze',
    perm: 'paghe.read',
    elemento: <OrePeriodoPage />,
  },

  /* IL RIEPILOGO ECONOMICO, dal 2026-09-25: il foglio presenze del mese
     con i soldi accanto — quanto ha maturato ognuno, acconti, rimborsi,
     trattenute, da bonificare. Lo prepara chi fa le paghe, lo firma il
     titolare, e dopo la firma va in archivio e si stampa per i bonifici.
     Subito dopo il foglio presenze perche' ne e' il seguito: prima le
     ore, poi i soldi. */
  {
    to: '/riepilogo-economico',
    etichetta: 'Riepilogo economico',
    perm: 'paghe.read',
    elemento: <RiepilogoEconomicoPage />,
  },


  /* Magazzino sotto `anagrafiche.read`, che ce l'hanno tutti tranne chi
     non e' in azienda: sapere cosa c'e' in magazzino non e' un
     privilegio, e il tecnico che parte per il cantiere e' proprio quello
     che deve poterlo guardare dal telefono.

     Le due azioni sono piu' strette e le decide la pagina: carica chi
     tiene il registro (`anagrafiche.write`), scarica anche il tecnico
     (`rapportini.create`). La regola vera resta la RLS. */
  { to: '/magazzino', etichetta: 'Magazzino', perm: 'anagrafiche.read', elemento: <MagazzinoPage /> },

  /* Documenti NON e' una voce di menu, ed e' una decisione del
     2026-09-10: un documento di cantiere e' quasi sempre un PDF che
     appartiene a UN cantiere. Messo in un elenco generale, la prima cosa
     che l'utente dovrebbe fare e' filtrarlo per cantiere — cioe' rifare
     a mano il raggruppamento che il cantiere gia' fornisce. Sta quindi
     dentro la scheda del cantiere, accanto alle foto.

     I documenti dell'IMPRESA (DURC, iscrizione alla cassa edile,
     assicurazioni, visura) sono un'altra cosa e vogliono un posto loro:
     hanno una scadenza e non un cantiere. Vedi STATO_LAVORI.md.

     Subappalti resta senza `perm` di proposito e non per fretta: finche'
     non esiste non c'e' niente da proteggere, e il cancello va scelto
     quando si sa chi ci lavora dentro. */
  {
    to: '/subappalti',
    etichetta: 'Subappalti',
    elemento: (
      <Segnaposto
        titolo="Subappalti"
        nota="Le imprese in subappalto e cosa fanno su ogni cantiere. Da costruire."
      />
    ),
  },

  {
    to: '/anagrafiche/fornitori',
    etichetta: 'Fornitori',
    perm: 'anagrafiche.write',
    elemento: <FornitoriPage />,
  },
  /* Economia la vede anche il TECNICO, ed è una scelta del 2026-09-10.
     Oggi la pagina sono i lavori extra: le lavorazioni fuori
     progetto di tutti i cantieri, che il tecnico segna compilando i
     rapportini e che finora poteva rileggere solo un cantiere per volta.
     È lavoro suo, e nella pagina non c'è un euro.

     Il cancello è in OR: `rapportini.create` fa entrare chi le scrive,
     `economics.read` chi tiene i conti. Chi vede cosa lo decide la RLS,
     non questa riga: il tecnico legge le note dei cantieri suoi, il
     titolare e l'amministrazione tutte. Stessa pagina, due risposte.

     Quando qui dentro arriveranno anche i soldi — costi, ricavi,
     margini — quelli andranno gated su `economics.read` DENTRO la
     pagina, non spostando questo cancello. */
  {
    to: '/economia',
    etichetta: 'Lavori extra',
    perm: ['rapportini.create', 'economics.read'],
    elemento: <EconomiaPage />,
  },
]

function proteggi(perm: Permission | Permission[] | undefined, elemento: ReactNode) {
  if (!perm) return elemento
  return <RequirePermission perm={perm}>{elemento}</RequirePermission>
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* Il muro sta QUI e non piu' in alto di proposito: `/login`
              deve restare raggiungibile anche a cartello alzato, perche'
              il muro riconosce chi passa dall'email e l'email si sa solo
              dopo l'accesso. Sta invece SOPRA `RequireAuth` perche' a un
              cliente che apre l'indirizzo va mostrato il cartello, non
              un modulo di login che lo invita a insistere. */}
          <Route
            element={
              <MuroWip>
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              </MuroWip>
            }
          >
            {VOCI.map(({ to, perm, elemento }) =>
              to === '/' ? (
                <Route key={to} index element={proteggi(perm, elemento)} />
              ) : (
                <Route key={to} path={to.slice(1)} element={proteggi(perm, elemento)} />
              ),
            )}

            {/* Fuori da VOCI perche' non e' una voce di menu: ci si
                arriva dal pulsante nella lista. Qui il cancello su
                `rapportini.create` ci sta — e' l'azione, non la
                lettura. */}
            <Route path="cantieri/nuovo" element={proteggi('cantieri.write', <CantiereForm />)} />

            {/* Aprire un cantiere vuol dire GUARDARLO, non modificarlo.
                Prima `/cantieri/:id` apriva il modulo dell'anagrafica: a
                chi non ha `cantieri.write` — cioe' al tecnico, che e'
                quello che ci entra ogni giorno — arrivavano quindici
                campi grigi e spenti. Adesso la scheda e' la lettura, che
                la RLS apre a chiunque abbia il cantiere fra i suoi, e il
                modulo sta dietro il permesso di scrittura. E' la stessa
                simmetria dei rapportini: la scheda si legge, `/modifica`
                si scrive. */}
            <Route path="cantieri/:id" element={<CantiereScheda />} />
            <Route
              path="cantieri/:id/modifica"
              element={proteggi('cantieri.write', <CantiereForm />)}
            />

            <Route
              path="rapportini/nuovo"
              element={proteggi('rapportini.create', <NuovoRapportino />)}
            />
            <Route path="rapportini/:id" element={<RapportinoPage />} />
            <Route
              path="rapportini/:id/modifica"
              element={proteggi('rapportini.create', <ModificaRapportino />)}
            />

            {/* La scheda si APRE con anagrafiche.read: chi puo' leggere
                l'elenco puo' leggere la riga. E' il form dentro che si
                disabilita da solo senza anagrafiche.write, invece di
                sbattere in faccia un 403 a chi voleva solo guardare. */}
            <Route
              path="anagrafiche/clienti/nuovo"
              element={proteggi('anagrafiche.write', <ClienteForm />)}
            />
            <Route
              path="anagrafiche/clienti/:id"
              element={proteggi('anagrafiche.read', <ClienteForm />)}
            />

            <Route
              path="anagrafiche/fornitori/nuovo"
              element={proteggi('anagrafiche.write', <FornitoreForm />)}
            />
            <Route
              path="anagrafiche/fornitori/:id"
              element={proteggi('anagrafiche.read', <FornitoreForm />)}
            />
            <Route
              path="anagrafiche/operai/nuovo"
              element={proteggi('anagrafiche.write', <DipendenteForm />)}
            />
            <Route
              path="anagrafiche/operai/:id"
              element={proteggi('anagrafiche.read', <DipendenteForm />)}
            />
            {/* L'economia della persona: netto, ferie, permessi. Solo chi fa
                le paghe (2026-09-23). */}
            <Route
              path="anagrafiche/operai/:id/economia"
              element={proteggi('paghe.read', <EconomiaRisorsaPage />)}
            />
          </Route>
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Layout
   ═══════════════════════════════════════════════════════════════════ */

function Layout() {
  const { can } = useSession()

  /* La scheda personale si interroga UNA VOLTA qui, non a ogni voce.
     Era il motivo per cui «Le mie ore» stava su un permesso invece che
     su questo fatto: «una query nel menu per ogni pagina caricata».
     L'obiezione era giusta allora e non vale piu' — `useMioDipendente`
     e' un hook di TanStack Query con la sua chiave, quindi la risposta
     sta in cache e la query parte una volta per sessione, non a ogni
     navigazione.

     Mentre carica `mio` e' `undefined` e la voce NON compare: meglio
     che spunti un attimo dopo, piuttosto che lampeggi e sparisca a chi
     la scheda non ce l'ha. */
  const { data: mio } = useMioDipendente()

  const visibili = VOCI.filter((v) => {
    const perPermesso = v.perm
      ? Array.isArray(v.perm)
        ? v.perm.some(can)
        : can(v.perm)
      : false
    const perScheda = Boolean(v.seHaScheda && mio)

    // Nessun cancello dichiarato: la voce e' di tutti.
    if (!v.perm && !v.seHaScheda) return true
    return perPermesso || perScheda
  })

  return (
    <div className="flex min-h-screen">
      <Barra voci={visibili} />

      <div className="flex min-w-0 flex-1 flex-col">
        <BarraMobile voci={visibili} />
        <main className="flex-1 p-6 lg:p-8 print:p-0">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

/** Sidebar scura come in wbs-office: contenuto chiaro, navigazione
 *  scura, e fra le due un bordo nero. */
function Barra({ voci }: { voci: Voce[] }) {
  const { app, org, orgs, setOrgAttiva, logout } = useSession()

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r-2 border-black bg-gray-900 lg:flex print:hidden">
      <div className="flex items-center gap-3 border-b-2 border-black px-5 py-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-black bg-amber-400 shadow-neo-sm">
          <span className="text-xs font-extrabold text-black">EG</span>
        </div>
        <div className="min-w-0">
          <p className="truncate font-extrabold leading-tight text-white">{env.VITE_APP_NAME}</p>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Cantieri e commesse
          </p>
        </div>
      </div>

      {/* Il selettore compare solo se c'e' davvero una scelta da fare:
          con una sola azienda una tendina da un elemento e' rumore. */}
      <div className="border-b-2 border-black px-5 py-4">
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
          Azienda
        </p>
        {orgs.length > 1 ? (
          <select
            value={org?.id ?? ''}
            onChange={(e) => setOrgAttiva(e.target.value)}
            className="w-full cursor-pointer rounded-xl border-2 border-black bg-white px-3 py-2 text-sm font-bold text-black focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.ragioneSociale}
              </option>
            ))}
          </select>
        ) : (
          <p className="truncate text-sm font-bold text-white">{org?.ragioneSociale}</p>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        {voci.map((v) => (
          <NavLink key={v.to} to={v.to} end={v.to === '/'} className={classeVoce}>
            <span className="flex items-center justify-between gap-2">
              {v.etichetta}
              <Pallino voce={v.to} />
            </span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t-2 border-black px-5 py-4">
        {/* Il nome sopra, l'indirizzo sotto in piccolo. Chi lavora qui si
            riconosce dal nome; l'email serve quando qualcosa non torna e
            bisogna sapere con quale utenza si e' entrati, quindi resta
            ma smette di essere la cosa piu' grossa del riquadro. */}
        <p className="truncate text-xs font-bold text-white" title={app?.email ?? undefined}>
          {app?.nome || app?.email}
        </p>
        {app?.nome && app?.email && (
          <p className="truncate text-[10px] font-semibold text-gray-500">{app.email}</p>
        )}
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          {org?.ruolo}
        </p>
        <Button dimensione="sm" onClick={logout} className="w-full">
          Esci
        </Button>
      </div>

      {/* CHI LO SVILUPPA, in fondo e in piccolo (2026-09-25): il nome in
          cima e' quello del cliente, «Edily Gestionale»; ENCREADE firma
          sotto, come si firma un lavoro e non come si intesta. */}
      <div className="flex items-center gap-2.5 border-t-2 border-black px-5 py-3">
        <img
          src={logoEncreade}
          alt=""
          className="h-9 w-9 shrink-0 rounded-lg border-2 border-black object-cover"
        />
        <div className="min-w-0 leading-tight">
          <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500">
            Sviluppato da
          </p>
          <p className="text-xs font-extrabold tracking-wide text-white">ENCREADE</p>
        </div>
      </div>
    </aside>
  )
}

/** Sotto i 1024px la sidebar sparisce e resta una striscia orizzontale.
 *  Un capocantiere apre i rapportini dal telefono, non dalla scrivania. */
function BarraMobile({ voci }: { voci: Voce[] }) {
  const { org, logout } = useSession()

  return (
    <header className="border-b-2 border-black bg-gray-900 lg:hidden print:hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-black bg-amber-400">
          <span className="text-[10px] font-extrabold text-black">EG</span>
        </div>
        <p className="min-w-0 flex-1 truncate text-sm font-extrabold text-white">
          {org?.ragioneSociale}
        </p>
        <Button dimensione="sm" onClick={logout}>
          Esci
        </Button>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3">
        {voci.map((v) => (
          <NavLink
            key={v.to}
            to={v.to}
            end={v.to === '/'}
            className={(stato) => cn(classeVoce(stato), 'shrink-0')}
          >
            <span className="flex items-center gap-2">
              {v.etichetta}
              <Pallino voce={v.to} />
            </span>
          </NavLink>
        ))}
      </nav>
    </header>
  )
}

/* ─────────────────────────────────────────────────────────────────
   IL PALLINO sulla voce di menu.

   Chiesto dall'utente il 2026-09-21: «LEI vivrà in quella pagina».
   Stefania sta dentro il gestionale tutto il giorno, e il pallino non
   serve a richiamarla da fuori — serve perche', mentre e' su un'altra
   schermata a fare altro, veda che e' arrivata roba nuova senza doverla
   andare a cercare.

   Un NUMERO e non un puntino cieco: «3» dice se vale la pena
   interrompere quello che si sta facendo, un puntino no. E' lo stesso
   ragionamento del contatore proposto per gli operai archiviati —
   dichiarare l'esistenza di righe invece di aspettare che qualcuno
   provi ad aprire.

   Il colore e' `lime-300`, lo stesso segnale positivo dei badge: qui
   non c'e' niente di rotto, e' lavoro che e' arrivato. Il rosso lo si
   tiene per le cose che non vanno.

   Sta qui e non dentro le due barre perche' lo usano tutte e due, e
   perche' il giorno in cui una seconda voce avra' il suo conteggio
   bastera' aggiungere una riga a questa funzione.
   ───────────────────────────────────────────────────────────────── */
function Pallino({ voce }: { voce: string }) {
  const { data } = useOreDaLeggere()

  if (voce !== '/ore') return null
  if (!data || data.giornate === 0) return null

  return (
    <span
      className="inline-flex min-w-5 items-center justify-center rounded-full border-2 border-black bg-lime-300 px-1.5 text-[10px] font-extrabold text-black"
      title={
        data.giornate === 1
          ? '1 giornata validata di recente'
          : `${data.giornate} giornate validate di recente`
      }
    >
      {data.giornate}
    </span>
  )
}

/** La voce attiva e' un blocco ambra con bordo nero: lo stesso segnale
 *  del bottone primario, cosi' "dove sono" si legge a colpo d'occhio. */
function classeVoce({ isActive }: { isActive: boolean }): string {
  return cn(
    'rounded-xl border-2 px-4 py-2.5 text-sm font-bold transition-colors',
    isActive
      ? 'border-black bg-amber-400 text-black shadow-neo-xs'
      : 'border-transparent text-gray-400 hover:bg-white/5 hover:text-white',
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Pagine
   ═══════════════════════════════════════════════════════════════════ */

function Segnaposto({ titolo, nota }: { titolo: string; nota?: string }) {
  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <h1 className="text-2xl font-extrabold text-black">{titolo}</h1>
      <Card className="p-5">
        <p className="text-sm font-semibold text-gray-600">
          {nota ?? 'Sezione non ancora costruita. Il permesso c’è, i dati arrivano dopo.'}
        </p>
      </Card>
    </div>
  )
}
