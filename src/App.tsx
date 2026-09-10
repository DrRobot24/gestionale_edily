import type { ReactNode } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Outlet } from 'react-router'
import { SessionProvider, useSession } from './modules/auth/SessionProvider'
import { RequireAuth, RequirePermission } from './modules/auth/guards'
import { LoginPage } from './modules/auth/LoginPage'
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
import { DipendenteForm } from './modules/anagrafiche/DipendenteForm'
import type { Permission } from './modules/auth/session'
import { env } from './lib/env'
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
  perm?: Permission
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
 * Rapportini invece non ha `perm` di proposito. La voce era protetta da
 * `rapportini.create`, e quindi `amministrazione` — che ha
 * `rapportini.read_all` proprio per leggerli — restava chiusa fuori
 * dalla lista. Il permesso di CREARE non e' il permesso di LEGGERE: il
 * cancello va sul pulsante "Nuovo", non sulla pagina.
 */
const VOCI: Voce[] = [
  { to: '/', etichetta: 'Home', elemento: <Dashboard /> },
  {
    to: '/cantieri',
    etichetta: 'Cantieri',
    perm: 'cantieri.read_all',
    elemento: <CantieriPage />,
  },
  { to: '/rapportini', etichetta: 'Rapportini', elemento: <RapportiniPage /> },

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
    to: '/anagrafiche/clienti',
    etichetta: 'Clienti',
    perm: 'anagrafiche.write',
    elemento: <ClientiPage />,
  },
  {
    to: '/anagrafiche/fornitori',
    etichetta: 'Fornitori',
    perm: 'anagrafiche.write',
    elemento: <FornitoriPage />,
  },
  {
    to: '/anagrafiche/operai',
    etichetta: 'Operai',
    perm: 'anagrafiche.write',
    elemento: <DipendentiPage />,
  },
  {
    to: '/economia',
    etichetta: 'Economia',
    perm: 'economics.read',
    elemento: <Segnaposto titolo="Economia" />,
  },
]

function proteggi(perm: Permission | undefined, elemento: ReactNode) {
  if (!perm) return elemento
  return <RequirePermission perm={perm}>{elemento}</RequirePermission>
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
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
  const visibili = VOCI.filter((v) => !v.perm || can(v.perm))

  return (
    <div className="flex min-h-screen">
      <Barra voci={visibili} />

      <div className="flex min-w-0 flex-1 flex-col">
        <BarraMobile voci={visibili} />
        <main className="flex-1 p-6 lg:p-8">
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
    <aside className="hidden w-64 shrink-0 flex-col border-r-2 border-black bg-gray-900 lg:flex">
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
            {v.etichetta}
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
    </aside>
  )
}

/** Sotto i 1024px la sidebar sparisce e resta una striscia orizzontale.
 *  Un capocantiere apre i rapportini dal telefono, non dalla scrivania. */
function BarraMobile({ voci }: { voci: Voce[] }) {
  const { org, logout } = useSession()

  return (
    <header className="border-b-2 border-black bg-gray-900 lg:hidden">
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
            {v.etichetta}
          </NavLink>
        ))}
      </nav>
    </header>
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
