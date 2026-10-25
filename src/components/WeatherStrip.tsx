import { useFarm } from '../state/farmStore'
import ProvenanceBadge from './ProvenanceBadge'
import { useUnits } from '../ui/units'

export function dayLabel(date: string, opts: Intl.DateTimeFormatOptions) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-CA', opts)
}

export default function WeatherStrip() {
  const u = useUnits()
  const { weather, weatherLabel, weatherMode } = useFarm()
  const offline = weather.source !== 'live'
  return (
    <section aria-labelledby="wx-h" className="rounded-xl border border-line bg-surface p-6">
      <header className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="wx-h" className="font-serif text-2xl tracking-tight">
          7-day forecast
        </h2>
        <span className="text-muted">{weatherLabel}</span>
        <span className="ml-auto flex items-center gap-2">
          {offline && (
            <span className="rounded-full bg-sun-soft px-2 py-0.5 text-[0.7rem] font-semibold tracking-wide text-sun uppercase ring-1 ring-sun/30 ring-inset">
              {weather.source === 'cache' ? 'Offline: cached forecast' : weatherMode === 'live' ? 'Offline: sample weather' : 'Sample weather'}
            </span>
          )}
          <ProvenanceBadge p={weather.provenance} />
        </span>
      </header>
      <ol className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {weather.days.slice(0, 7).map((d, i) => (
          <li key={d.date} className={`rounded-lg border p-3 text-center ${i === 0 ? 'border-ink' : 'border-line'}`}>
            <div className="text-sm font-semibold">{i === 0 ? 'Today' : dayLabel(d.date, { weekday: 'short' })}</div>
            <div className="text-xs text-muted">{dayLabel(d.date, { month: 'short', day: 'numeric' })}</div>
            <div className="mt-2 text-xl font-semibold tabular-nums">{Math.round(d.tMaxC)}°</div>
            <div className="text-sm text-muted tabular-nums">{Math.round(d.tMinC)}°</div>
            <div className={`mt-2 text-sm font-medium tabular-nums ${d.rainMm >= 3 ? 'text-water' : 'text-muted'}`}>
              {u.depth(Math.round(d.rainMm))} rain
            </div>
            <div className="text-sm text-muted tabular-nums">Dry-out {u.depth(Math.round(d.et0Mm * 10) / 10)}</div>
          </li>
        ))}
      </ol>
    </section>
  )
}
