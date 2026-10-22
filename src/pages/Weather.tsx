import { CloudRain } from 'lucide-react'
import { useFarm } from '../state/farmStore'
import { dayLabel } from '../components/WeatherStrip'
import { Card, PageHeader } from '../ui/kit'
import { dayLook } from '../ui/widgets'

export default function Weather() {
  const { farm, weather, weatherLabel, weatherMode, setWeatherMode } = useFarm()
  const days = weather.days.slice(0, 7)
  const rain48 = weather.days.slice(0, 2).reduce((t, d) => t + Math.max(0, d.rainMm), 0)
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Weather"
        subtitle={`${farm.location || 'Your farm'} · ${weatherLabel}`}
        actions={
          <div role="tablist" aria-label="Weather source" className="flex rounded-xl border border-line bg-surface p-1">
            {(['sample', 'live'] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={weatherMode === m}
                onClick={() => setWeatherMode(m)}
                className={`min-h-10 rounded-lg px-4 font-semibold ${weatherMode === m ? 'bg-forest text-white' : 'text-muted'}`}
              >
                {m === 'sample' ? 'Sample week' : 'Live forecast'}
              </button>
            ))}
          </div>
        }
      />
      {weatherMode === 'live' && weather.source === 'bundled' && (
        <p className="rounded-xl border border-sun/40 bg-sun-soft px-4 py-2 text-sm">Live forecast unavailable right now, showing sample weather.</p>
      )}
      {rain48 >= 10 && (
        <p className="flex items-center gap-2 rounded-xl border border-water/30 bg-water-soft px-4 py-3 font-semibold text-water">
          <CloudRain aria-hidden className="size-5" /> About {Math.round(rain48)} mm of rain in the next 48 h. Recommendations already account for it.
        </p>
      )}
      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {days.map((d, i) => {
          const { Icon, word, cls } = dayLook(d)
          return (
            <li key={d.date}>
              <Card as="div" className={`flex h-full flex-col items-center gap-1 text-center ${i === 0 ? 'ring-2 ring-forest' : ''}`}>
                <div className="font-semibold">{i === 0 ? 'Today' : dayLabel(d.date, { weekday: 'long' })}</div>
                <div className="text-sm text-muted">{dayLabel(d.date, { month: 'short', day: 'numeric' })}</div>
                <Icon aria-hidden className={`my-1 size-9 ${cls}`} />
                <div className="text-2xl font-bold tabular-nums">
                  {Math.round(d.tMaxC)}° <span className="text-base font-normal text-muted">/ {Math.round(d.tMinC)}°</span>
                </div>
                <div className="text-sm">{word}</div>
                <div className="mt-1 text-sm text-muted tabular-nums">
                  Rain {d.rainMm.toFixed(0)} mm · ET₀ {d.et0Mm.toFixed(1)} mm
                </div>
              </Card>
            </li>
          )
        })}
      </ol>
      <p className="text-sm text-muted">ET₀ is how much water a reference grass crop would lose that day. Higher ET₀ means your crops dry out faster.</p>
    </div>
  )
}
