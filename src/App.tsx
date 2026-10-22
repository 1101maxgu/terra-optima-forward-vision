// PLACEHOLDER — Agent B owns the app shell and routing.
import { useFarm } from './state/farmStore'

export default function App() {
  const { loading, farm, zones, zoneStatus } = useFarm()
  if (loading) return <p className="p-8">Loading…</p>
  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold">{farm.name}</h1>
      <ul>
        {zones.map((z) => (
          <li key={z.id}>
            {z.name}: {zoneStatus(z.id).status}
          </li>
        ))}
      </ul>
    </main>
  )
}
