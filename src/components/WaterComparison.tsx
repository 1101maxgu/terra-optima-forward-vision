import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CROPS } from '../data/crops'
import { useFarm } from '../state/farmStore'
import ProvenanceBadge from './ProvenanceBadge'
import { litres } from './status'
import { dayLabel } from './WeatherStrip'

const FORMULA = 'Savings % = (Baseline − GeoViva) / Baseline × 100'
// Keep in sync with --color-water / --color-sun in index.css (SVG attributes can't read CSS vars reliably).
const WATER = '#0b6683'
const SUN = '#9a5b00'

const reductionPct = (base: number, geo: number) => (base > 0 ? ((base - geo) / base) * 100 : 0)

function Savings({ avoided, pctValue }: { avoided: number; pctValue: number }) {
  if (avoided >= 0) return <span className="text-leaf">{litres(avoided)} avoided ({pctValue.toFixed(0)}%)</span>
  return <span className="text-alert">{litres(-avoided)} more than schedule</span>
}

export default function WaterComparison() {
  const { zones, comparisons, schedule, setSchedule } = useFarm()
  const rows = zones.map((z) => ({ z, c: comparisons[z.id] }))
  const base = rows.reduce((s, r) => s + r.c.baselineLitres, 0)
  const geo = rows.reduce((s, r) => s + r.c.geovivaLitres, 0)
  const avoided = base - geo
  const totalPct = reductionPct(base, geo)

  const days = rows[0]?.c.daily ?? []
  let cb = 0
  let cg = 0
  const chart = days.map((d, i) => {
    cb += rows.reduce((s, r) => s + (r.c.daily[i]?.baselineLitres ?? 0), 0)
    cg += rows.reduce((s, r) => s + (r.c.daily[i]?.geovivaLitres ?? 0), 0)
    return { day: dayLabel(d.date, { month: 'short', day: 'numeric' }), Baseline: Math.round(cb), GeoViva: Math.round(cg) }
  })

  const num = (v: string, min: number, max: number, fallback: number) => {
    const n = Number(v)
    return Number.isFinite(n) && v !== '' ? Math.min(max, Math.max(min, n)) : fallback
  }

  return (
    <section aria-labelledby="water-h" className="flex flex-col gap-6 rounded-xl border border-line bg-surface p-6">
      <header className="flex flex-wrap items-center gap-3">
        <h2 id="water-h" className="font-serif text-2xl tracking-tight">
          Water use: fixed schedule vs GeoViva
        </h2>
        <span className="rounded-md bg-sun-soft px-2 py-1 text-sm font-semibold text-sun ring-1 ring-sun/30 ring-inset">Modelled — not validated</span>
        <ProvenanceBadge p="projected" />
        <span className="w-full text-muted">14-day model, all zones, same weather, both starting from well-watered soil. Baseline = your fixed schedule below.</span>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Big label="Fixed schedule" value={litres(base)} />
        <Big label="Following GeoViva" value={litres(geo)} accent="text-water" />
        <div className="rounded-lg border border-line p-4">
          <div className="text-sm text-muted">
            {avoided >= 0 ? 'Avoided' : 'Extra water'}{' '}
            <abbr title={FORMULA} className="cursor-help">
              (how?)
            </abbr>
          </div>
          <div className={`text-3xl font-semibold tabular-nums ${avoided >= 0 ? 'text-leaf' : 'text-alert'}`}>
            {avoided >= 0 ? `${totalPct.toFixed(0)}%` : `+${(-totalPct).toFixed(0)}%`}
          </div>
          <div className="text-sm tabular-nums">{litres(Math.abs(avoided))}</div>
        </div>
      </div>
      {avoided < 0 && (
        <p className="rounded-md bg-alert-soft p-3 text-alert">
          In this scenario GeoViva recommends more water than the fixed schedule — the schedule is under-watering these crops.
        </p>
      )}

      <div className="h-64 w-full" role="img" aria-label={`Cumulative litres over 14 days: baseline ${litres(base)}, GeoViva ${litres(geo)}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chart} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid stroke="#e3e6dd" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#4f5d56' }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 12, fill: '#4f5d56' }} tickFormatter={(v: number) => `${Math.round(v / 1000)}k L`} width={56} />
            <Tooltip formatter={(v) => litres(Number(v))} />
            <Legend />
            <Line type="monotone" dataKey="Baseline" name="Fixed schedule (cumulative)" stroke={SUN} strokeWidth={3} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="GeoViva" name="GeoViva (cumulative)" stroke={WATER} strokeWidth={3} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left tabular-nums">
          <caption className="sr-only">Per-zone modelled water use</caption>
          <thead className="border-b border-line text-sm text-muted">
            <tr>
              <th className="py-2 font-medium">Zone</th>
              <th className="py-2 font-medium">Fixed schedule</th>
              <th className="py-2 font-medium">GeoViva</th>
              <th className="py-2 font-medium">Difference</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(({ z, c }) => (
              <tr key={z.id}>
                <td className="py-2 font-medium">
                  {z.name} <span className="text-muted">· {CROPS[z.cropId].name}</span>
                </td>
                <td className="py-2">{litres(c.baselineLitres)}</td>
                <td className="py-2">{litres(c.geovivaLitres)}</td>
                <td className="py-2">
                  <Savings avoided={c.avoidedLitres} pctValue={c.reductionPct} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-end gap-4 border-t border-line pt-4">
        <span className="font-medium">Your fixed schedule:</span>
        <label className="flex flex-col gap-1 text-sm">
          mm per event
          <input
            type="number"
            min={1}
            max={50}
            value={schedule.mmPerEvent}
            onChange={(e) => setSchedule({ ...schedule, mmPerEvent: num(e.target.value, 1, 50, schedule.mmPerEvent) })}
            className="w-24 rounded-md border border-line px-2 py-1.5 text-base"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          events per week
          <input
            type="number"
            min={0}
            max={7}
            value={schedule.eventsPerWeek}
            onChange={(e) => setSchedule({ ...schedule, eventsPerWeek: num(e.target.value, 0, 7, schedule.eventsPerWeek) })}
            className="w-24 rounded-md border border-line px-2 py-1.5 text-base"
          />
        </label>
      </div>

      <p className="text-sm text-muted">
        <strong className="font-semibold text-ink">{FORMULA}.</strong> Both runs use the same modelled weather and soil-water balance. The baseline is a
        typical fixed timer schedule, so savings depend on how wasteful that schedule is. These are projections for a pilot to test, not field
        results.
      </p>
    </section>
  )
}

function Big({ label, value, accent = '' }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-line p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className={`text-3xl font-semibold tabular-nums ${accent}`}>{value}</div>
      <div className="text-sm text-muted">over 14 days</div>
    </div>
  )
}
