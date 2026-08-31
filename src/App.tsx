import { BrowserRouter, Routes, Route, Link, Outlet } from 'react-router'
import { SessionProvider, useSession } from './modules/auth/SessionProvider'
import { RequireAuth, RequirePermission } from './modules/auth/guards'
import { LoginPage } from './modules/auth/LoginPage'
import { usePermission } from './modules/auth/usePermission'

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
            <Route index element={<Home />} />
            <Route
              path="rapportini"
              element={
                <RequirePermission perm="rapportini.create">
                  <Segnaposto titolo="Rapportini" />
                </RequirePermission>
              }
            />
            <Route
              path="economia"
              element={
                <RequirePermission perm="economics.read">
                  <Segnaposto titolo="Economia" />
                </RequirePermission>
              }
            />
          </Route>
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  )
}

function Layout() {
  const { app, org, orgs, setOrgAttiva, logout } = useSession()
  const puoValidare = usePermission('rapportini.validate')
  const vedeEconomia = usePermission('economics.read')

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      <header
        style={{
          display: 'flex',
          gap: 16,
          alignItems: 'center',
          padding: '10px 16px',
          borderBottom: '1px solid #e3e3e3',
        }}
      >
        <strong>Gestionale</strong>

        {/* Il selettore compare solo se serve davvero. */}
        {orgs.length > 1 ? (
          <select value={org?.id ?? ''} onChange={(e) => setOrgAttiva(e.target.value)}>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.ragioneSociale}
              </option>
            ))}
          </select>
        ) : (
          <span style={{ color: '#666' }}>{org?.ragioneSociale}</span>
        )}

        <nav style={{ display: 'flex', gap: 12, marginLeft: 'auto' }}>
          <Link to="/">Home</Link>
          <Link to="/rapportini">Rapportini</Link>
          {vedeEconomia && <Link to="/economia">Economia</Link>}
          <button onClick={logout}>Esci</button>
        </nav>
      </header>

      <main style={{ padding: 16 }}>
        <p style={{ color: '#666', fontSize: 13 }}>
          {app?.email} — ruolo <strong>{org?.ruolo}</strong>
          {puoValidare && ' (puoi validare i rapportini)'}
        </p>
        <Outlet />
      </main>
    </div>
  )
}

function Home() {
  const { org } = useSession()
  return (
    <>
      <h2 style={{ fontSize: 18 }}>{org?.ragioneSociale}</h2>
      <p>Permessi attivi: {[...(org?.permessi ?? [])].sort().join(', ')}</p>
    </>
  )
}

function Segnaposto({ titolo }: { titolo: string }) {
  return <h2 style={{ fontSize: 18 }}>{titolo}</h2>
}
