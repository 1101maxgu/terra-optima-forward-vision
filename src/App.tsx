import { useRoute } from './router'
import { useFarm } from './state/farmStore'
import AppShell from './components/shell/AppShell'
import Home from './pages/Home'
import Zones from './pages/Zones'
import CreateZone from './pages/CreateZone'
import EditBoundary from './pages/EditBoundary'
import ZoneDetail from './pages/ZoneDetail'
import Sensors from './pages/Sensors'
import Weather from './pages/Weather'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import Help from './pages/Help'
import Pricing from './pages/Pricing'
import Account from './pages/Account'
import ErrorBoundary from './ui/ErrorBoundary'

function Page({ segments }: { segments: string[] }) {
  const [a, b, c] = segments
  if (a === 'zones') {
    if (!b) return <Zones />
    if (b === 'new') return <CreateZone />
    if (c === 'boundary') return <EditBoundary zoneId={b} />
    return <ZoneDetail zoneId={b} />
  }
  if (a === 'sensors') return <Sensors />
  if (a === 'weather') return <Weather />
  if (a === 'reports') return <Reports />
  if (a === 'settings') return <Settings />
  if (a === 'help') return <Help topic={b} />
  if (a === 'pricing') return <Pricing />
  if (a === 'account') return <Account />
  return <Home />
}

export default function App() {
  const { path } = useRoute()
  const { loading, loadError, reload } = useFarm()
  const route = path.split('?')[0]
  return (
    <AppShell path={route}>
      {loadError ? (
        <div role="alert" className="mx-auto mt-10 max-w-lg rounded-2xl border border-alert/30 bg-alert-soft p-6">
          <h1 className="text-xl font-bold text-alert">Could not load your farm data</h1>
          <p className="mt-2">{loadError}</p>
          <button type="button" onClick={reload} className="btn-primary mt-4">
            Try again
          </button>
        </div>
      ) : loading ? (
        <div role="status" aria-label="Loading farm data" className="grid animate-pulse gap-4">
          <div className="h-10 w-72 rounded-xl bg-stale-soft" />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-stale-soft" />
            ))}
          </div>
          <div className="h-80 rounded-2xl bg-stale-soft" />
        </div>
      ) : (
        <ErrorBoundary resetKey={route}>
          <Page segments={route.split('/').filter(Boolean)} />
        </ErrorBoundary>
      )}
    </AppShell>
  )
}
