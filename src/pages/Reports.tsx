import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, Droplets } from 'lucide-react'
import { useFarm } from '../state/farmStore'
import { CROPS } from '../data/crops'
import { Card, PageHeader, SampleBanner, fmtLitres } from '../ui/kit'
import { CROP_EMOJI } from '../ui/farm'
import { SectionTitle } from '../ui/widgets'
import { HistoryCard, ProjectionCard } from '../components/Outcomes'

// Literal colour: SVG fills can't read CSS vars reliably. Keep in sync with --color-water.
const WATER = '#0b6683'
const DAY = 86_400_000

export default function Reports() {
  const { dataset, zones, events, readings } = useFarm()
  const [days, setDays] = useState<7 | 30>(7)
  const since = Date.now() - days * DAY

  const rows = zones.map((z) => {
    const ev = events.filter((e) => e.zoneId === z.id && Date.parse(e.timestamp) >= since)
    const rd = readings.filter((r) => r.zoneId === z.id && Date.parse(r.timestamp) >= since)
    const daysWithData = new Set(rd.map((r) => r.timestamp.slice(0, 10))).size
    return {
      z,
      litres: ev.reduce((t, e) => t + e.litres, 0),
      mm: ev.reduce((t, e) => t + e.mm, 0),
      count: ev.length,
      readings: rd.length,
      coverage: Math.min(100, Math.round((daysWithData / days) * 100)),
    }
  })
  const total = rows.reduce((t, r) => t + r.litres, 0)
  const chart = rows.map((r) => ({ zone: r.z.name.split(' · ')[0], Litres: Math.round(r.litres) }))

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Reports"
        help="weather-reports"
        subtitle="Water, waterings and labour compared with a baseline, what you applied, and how complete your sensor data is."
        actions={
          <div role="tablist" aria-label="Period" className="flex rounded-xl border border-line bg-surface p-1">
            {([7, 30] as const).map((d) => (
              <button
                key={d}
                role="tab"
                aria-selected={days === d}
                onClick={() => setDays(d)}
                className={`min-h-10 rounded-lg px-4 font-semibold ${days === d ? 'bg-forest text-white' : 'text-muted'}`}
              >
                Last {d} days
              </button>
            ))}
          </div>
        }
      />
      {dataset === 'sample' && <SampleBanner />}

      {zones.length === 0 ? (
        <Card className="text-muted">
          Add a zone first.{' '}
          <a href="#/zones/new" className="font-semibold text-leaf underline underline-offset-4">
            Create a zone
          </a>
        </Card>
      ) : (
        <>
          <ProjectionCard />
          <HistoryCard days={days} />
          <Card>
            <SectionTitle icon={<Droplets aria-hidden className="size-5 text-water" />} title={`Water applied · last ${days} days`} />
            <p className="mb-3 text-3xl font-bold tabular-nums">{fmtLitres(total)}</p>
            {total === 0 ? (
              <p className="text-muted">No irrigation logged in this period. Log watering from a zone's page.</p>
            ) : (
              <div className="h-64 w-full" role="img" aria-label={`Litres applied per zone, total ${fmtLitres(total)}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="#e3e6dd" vertical={false} />
                    <XAxis dataKey="zone" tick={{ fontSize: 13, fill: '#4f5d56' }} />
                    <YAxis tick={{ fontSize: 12, fill: '#4f5d56' }} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)} width={44} />
                    <Tooltip formatter={(v) => fmtLitres(Number(v))} cursor={{ fill: '#f6f4ec' }} />
                    <Bar dataKey="Litres" fill={WATER} radius={[6, 6, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card>
            <SectionTitle icon={<Activity aria-hidden className="size-5 text-leaf" />} title="By zone" />
            <ul className="divide-y divide-line">
              {rows.map((r) => (
                <li key={r.z.id} className="grid grid-cols-2 gap-x-4 gap-y-1 py-3 sm:grid-cols-[2fr_1fr_1fr_1.5fr] sm:items-center">
                  <a href={`#/zones/${r.z.id}`} className="col-span-2 flex items-center gap-3 sm:col-span-1">
                    <span aria-hidden className="text-2xl">
                      {CROP_EMOJI[r.z.cropId]}
                    </span>
                    <span>
                      <span className="block font-semibold">{r.z.name}</span>
                      <span className="block text-sm text-muted">{CROPS[r.z.cropId].name}</span>
                    </span>
                  </a>
                  <div>
                    <div className="font-semibold tabular-nums">{fmtLitres(r.litres)}</div>
                    <div className="text-sm text-muted tabular-nums">
                      {Math.round(r.mm)} mm · {r.count} event{r.count === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold tabular-nums">{r.readings}</div>
                    <div className="text-sm text-muted">readings</div>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Days with readings</span>
                      <span className={`font-semibold tabular-nums ${r.coverage < 50 ? 'text-alert' : ''}`}>{r.coverage}%</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-stale-soft">
                      <div className={`h-2 rounded-full ${r.coverage < 50 ? 'bg-alert' : 'bg-leaf'}`} style={{ width: `${r.coverage}%` }} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  )
}
