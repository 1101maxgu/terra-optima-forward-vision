// Agent D. Contract: default export, no props, reads useFarm().
import { useFarm } from '../state/farmStore'

const fmt = (n: number) => Math.round(n).toLocaleString('en-CA')

function Projected() {
  return (
    <span className="rounded-full bg-sun-soft px-2 py-0.5 text-xs font-semibold text-sun">
      Projected (modelled, not validated)
    </span>
  )
}

// Official SDG colours, used only as a thin accent bar.
const SDGS = [
  { n: 6, name: 'Clean Water and Sanitation', colour: '#26BDE2', indicator: 'Litres of irrigation avoided', status: 'Computed above — projected' },
  { n: 13, name: 'Climate Action', colour: '#3F7E44', indicator: 'Climate resilience: water used per kg of marketable crop', status: 'Pilot metric to collect' },
  { n: 2, name: 'Zero Hunger', colour: '#DDA63A', indicator: 'Farms served, including free-tier community and food-security farms', status: 'Pilot metric to collect' },
]

const TIERS = [
  ['Free', '1 zone, manual entry'],
  ['Grower · $99/yr', 'Up to 5 zones, weather, history, CSV'],
  ['Farm Pro · $249/yr', 'More zones, reports'],
  ['Sensor kit · at cost (~$125)', 'Optional'],
]

export default function ImpactPanel() {
  const { comparisons } = useFarm()
  const all = Object.values(comparisons)
  const baseline = all.reduce((s, c) => s + c.baselineLitres, 0)
  const geoviva = all.reduce((s, c) => s + c.geovivaLitres, 0)
  const avoided = baseline - geoviva
  const pct = baseline > 0 ? (avoided / baseline) * 100 : 0
  const days = all[0]?.daily.length ?? 0

  const stats = [
    ['Fixed schedule', `${fmt(baseline)} L`],
    ['GeoViva', `${fmt(geoviva)} L`],
    [avoided >= 0 ? 'Litres avoided' : 'Extra litres', `${fmt(Math.abs(avoided))} L`],
    [avoided >= 0 ? 'Reduction' : 'Increase', `${Math.abs(pct).toFixed(0)}%`],
  ]

  return (
    <section className="space-y-6 rounded-xl border border-line bg-surface p-4 sm:p-6" aria-labelledby="impact-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="impact-heading" className="text-2xl font-bold text-ink">
          Impact across all zones{days ? ` (${days} days)` : ''}
        </h2>
        <Projected />
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(([label, value], i) => (
          <div key={label} className={`rounded-lg border border-line p-3 ${i >= 2 ? 'bg-water-soft' : 'bg-paper'}`}>
            <dt className="text-sm text-muted">{label}</dt>
            <dd className={`text-2xl font-bold tabular-nums ${i >= 2 ? 'text-water' : 'text-ink'}`}>{value}</dd>
            <dd className="mt-1 text-xs text-muted">Projected (modelled, not validated)</dd>
          </div>
        ))}
      </dl>
      {avoided < 0 && (
        <p className="rounded-lg bg-sun-soft px-3 py-2 text-sm text-ink">
          GeoViva would apply more water here because the fixed schedule under-waters. Saving water is not the goal by
          itself — avoiding stress and waste both count.
        </p>
      )}

      <div>
        <h3 className="text-xl font-bold text-ink">UN Sustainable Development Goals</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {SDGS.map((g) => (
            <article key={g.n} className="rounded-lg border border-line bg-paper p-4" style={{ borderTop: `6px solid ${g.colour}` }}>
              <p className="text-sm font-bold text-muted">SDG {g.n}</p>
              <h4 className="text-lg font-bold text-ink">{g.name}</h4>
              <p className="mt-2 text-sm text-ink">
                <span className="font-semibold">Indicator:</span> {g.indicator}
              </p>
              <p className={`mt-2 text-xs font-semibold ${g.n === 6 ? 'text-water' : 'text-sun'}`}>
                {g.n === 6 ? `${fmt(Math.max(avoided, 0))} L — projected` : g.status}
              </p>
            </article>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-water bg-water-soft p-4">
          <h3 className="text-lg font-bold text-ink">How we'll validate it</h3>
          <p className="mt-1 text-sm text-ink">
            Future pilot with 1–2 growers: a baseline season or split field (usual practice vs GeoViva).
          </p>
          <p className="mt-2 text-sm text-ink">
            We'll measure: metered water applied, soil moisture, rainfall, yield and quality, and labour time.
          </p>
          <p className="mt-3 rounded bg-surface px-3 py-2 font-mono text-sm text-ink">
            Water savings % = (Baseline − GeoViva) / Baseline × 100
          </p>
          <p className="mt-2 text-sm font-semibold text-water">
            Success = less unnecessary irrigation without hurting yield.
          </p>
        </div>

        <div className="rounded-lg border border-leaf bg-leaf-soft p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-ink">How GeoViva sustains itself</h3>
            <span className="text-xs font-semibold text-leaf">Preliminary — to be validated</span>
          </div>
          <ul className="mt-2 space-y-1.5 text-sm">
            {TIERS.map(([t, d]) => (
              <li key={t} className="flex flex-wrap justify-between gap-x-3 border-b border-line pb-1">
                <span className="font-semibold text-ink">{t}</span>
                <span className="text-muted">{d}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-ink">
            Paying farms plus grants and water-programme sponsors fund a free tier for community and food-security farms.
          </p>
          <p className="mt-2 text-sm text-ink">
            <span className="font-semibold">Break-even ≈ 37 paying farms</span> on a lean, volunteer-run year 1
            (illustrative).
          </p>
        </div>
      </div>
    </section>
  )
}
