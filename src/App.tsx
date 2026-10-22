// PLACEHOLDER — Agent B owns layout.
import { useFarm } from './state/farmStore'

export default function App() {
  const { zones, recommendations } = useFarm()
  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold">GeoViva</h1>
      <ul>
        {zones.map((z) => (
          <li key={z.id}>
            {z.name}: {recommendations[z.id].status}
          </li>
        ))}
      </ul>
    </main>
  )
}
