import { Bell, CalendarClock, ChartColumn, ChevronRight, CircleHelp, CloudSun, Droplets, Play, Plus, Radio, Sprout, Tag, TrendingDown } from 'lucide-react'
import { useFarm, type ZoneStatus } from '../state/farmStore'
import type { Zone } from '../types'
import { splitSessions } from '../engine/irrigation'
import { runText } from '../data/methods'
import { CROPS } from '../data/crops'
import { Card, SampleBanner, StatusPill, fmtPct, timeAgo } from '../ui/kit'
import { CROP_EMOJI, STATUS_RANK, bestTime, greeting, shortName, useAlerts, useProjection } from '../ui/farm'
import { ForecastMini, SectionTitle, StatCard } from '../ui/widgets'
import { useUnits } from '../ui/units'
import { ALERT_ICON } from '../components/shell/TopBar'
import AlertPopup from '../components/AlertPopup'

type Row = { z: Zone; st: ZoneStatus }

function checkReason(st: ZoneStatus) {
  if (!st.lastUpdate && st.discounted.length) return 'The sensor may not be working'
  if (!st.lastUpdate) return 'No readings yet'
  return `No new readings since ${timeAgo(st.lastUpdate)}`
}

function Amount({ st, z }: Row) {
  const u = useUnits()
  if (st.status === 'check-sensor') return <span className="text-stale">{checkReason(st)}</span>
  const rec = st.rec
  if (!rec || rec.grossMm <= 0) return <span className="text-muted">No water needed</span>
  const split = rec.grossMm > 20 ? splitSessions(rec.grossMm, z.areaM2) : null
  return (
    <span>
      <span className="block font-semibold">{runText(rec.grossMm, z.method, split?.sessions)}</span>
      <span className="block text-sm text-muted tabular-nums">
        {u.depth(rec.grossMm)} ({u.volume(rec.litres)}){split && `, split into ${split.sessions} waterings`}
      </span>
    </span>
  )
}

export default function Home() {
  const { farm, zones, sensors, weather, dataset, setDataset, zoneStatus, sensorState } = useFarm()
  const u = useUnits()
  const alerts = useAlerts()
  const rows: Row[] = zones.map((z) => ({ z, st: zoneStatus(z.id) }))
  const byUrgency = [...rows].sort((a, b) => STATUS_RANK[a.st.status] - STATUS_RANK[b.st.status] || (b.st.rec?.grossMm ?? 0) - (a.st.rec?.grossMm ?? 0))

  const online = sensors.filter((s) => sensorState(s) === 'online').length
  const offline = sensors.filter((s) => sensorState(s) === 'offline').length
  const next = byUrgency.find((r) => r.st.status === 'water-today') ?? byUrgency.find((r) => r.st.status === 'water-soon')
  const weatherSrc = weather.source === 'bundled' ? 'Sample weather' : 'Live forecast'

  return (
    <div className="flex flex-col gap-5">
      {dataset === 'sample' && <SampleBanner />}
      {dataset === 'sample' && <AlertPopup />}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setDataset(dataset === 'sample' ? 'mine' : 'sample')} className="btn-primary inline-flex min-h-12 items-center gap-2">
          <Play aria-hidden className="size-5" /> {dataset === 'sample' ? 'Back to my farm' : 'View the demo farm'}
        </button>
        <a href="#/help" className="btn-secondary inline-flex min-h-12 items-center gap-2"><CircleHelp aria-hidden className="size-5" /> Help</a>
        <a href="#/pricing" className="btn-secondary inline-flex min-h-12 items-center gap-2"><Tag aria-hidden className="size-5" /> Plans and pricing</a>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{greeting()}</h1>
          <p className="mt-1 text-lg text-muted">
            {farm.name || 'Your farm'}
            {farm.location && ` · ${farm.location}`}
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <a href="#/zones/new" className="btn-primary col-span-2 inline-flex min-h-12 items-center justify-center gap-2 text-center">
            <Plus aria-hidden className="size-5 shrink-0" /> <span>Add a field section</span>
          </a>
          <a href="#/sensors" className="btn-secondary inline-flex min-h-12 items-center justify-center gap-2 text-center">
            <Radio aria-hidden className="size-5 shrink-0" /> <span>Add sensor</span>
          </a>
          <a href="#/reports" className="btn-secondary inline-flex min-h-12 items-center justify-center gap-2 text-center">
            <ChartColumn aria-hidden className="size-5 shrink-0" /> <span>Reports</span>
          </a>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <StatCard icon={<Sprout className="size-6" />} tone="bg-leaf-soft text-leaf" value={zones.length} label="Fields" />
        <StatCard
          icon={<Radio className="size-6" />}
          tone="bg-water-soft text-water"
          value={`${online} of ${sensors.length}`}
          label="Sensors on"
          sub={offline > 0 ? <span className="font-semibold text-alert">{offline} not reporting</span> : undefined}
        />
        <StatCard
          icon={<CalendarClock className="size-6" />}
          tone={next?.st.status === 'water-today' ? 'bg-alert-soft text-alert' : 'bg-sun-soft text-sun'}
          value={next ? (next.st.status === 'water-today' ? 'Today' : 'In 1 to 2 days') : 'Nothing due'}
          label="Next watering"
          sub={next ? shortName(next.z.name) : undefined}
        />
      </div>

      {zones.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <Sprout aria-hidden className="size-10 text-leaf" />
          <h2 className="text-xl font-bold">Set up your first field section</h2>
          <p className="max-w-md text-muted">Draw a field on the map, choose the crop and soil, and GeoViva will tell you when and how much to water.</p>
          <a href="#/zones/new" className="btn-primary inline-flex min-h-12 items-center gap-2">
            <Plus aria-hidden className="size-5" /> Create your first field section
          </a>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Card>
            <SectionTitle icon={<Droplets aria-hidden className="size-5 text-water" />} title="What to water today" action={<a href="#/zones">All fields →</a>} />
            <ul className="flex flex-col gap-3">
              {byUrgency.map((r) => (
                <li key={r.z.id}>
                  <a href={`#/zones/${r.z.id}`} className="flex items-start gap-3 rounded-xl border border-line p-4 hover:bg-paper">
                    <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-paper text-2xl">{CROP_EMOJI[r.z.cropId]}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          <span className="block text-lg font-semibold">{shortName(r.z.name)}</span>
                          <span className="block text-sm text-muted">{CROPS[r.z.cropId].name} · soil {fmtPct(r.st.moisturePct)} wet</span>
                        </span>
                        <StatusPill status={r.st.status} size="sm" />
                      </span>
                      <span className="mt-2 block"><Amount {...r} /></span>
                      {r.st.status !== 'check-sensor' && r.st.rec && r.st.rec.grossMm > 0 && <span className="block text-sm text-muted">{bestTime(r.st.rec)}</span>}
                    </span>
                    <ChevronRight aria-hidden className="mt-3 size-5 shrink-0 text-muted" />
                  </a>
                </li>
              ))}
            </ul>
            <SavingsLink />
          </Card>

          <div className="flex flex-col gap-5">
            <Card>
              <SectionTitle icon={<CloudSun aria-hidden className="size-5 text-sun" />} title="Weather" action={<a href="#/weather">Details →</a>} />
              <p className="mb-2 text-sm text-muted">{farm.location || 'Farm location'} · {weatherSrc}</p>
              <ForecastMini days={weather.days.slice(0, 4)} />
            </Card>
            <Card>
              <SectionTitle icon={<Bell aria-hidden className="size-5 text-alert" />} title="Alerts" />
              {alerts.length === 0 ? (
                <p className="text-muted">All clear. Nothing needs your attention.</p>
              ) : (
                <ul className="-mx-2 flex flex-col">
                  {alerts.slice(0, 3).map((a) => {
                    const { Icon, cls } = ALERT_ICON[a.level]
                    return (
                      <li key={a.id}>
                        <a href={`#${a.href}`} className="flex min-h-12 items-start gap-3 rounded-xl px-2 py-2 text-sm hover:bg-paper">
                          <Icon aria-hidden className={`size-5 shrink-0 ${cls}`} />
                          <span className="flex-1">{u.text(a.text)}</span>
                          {a.at && <span className="whitespace-nowrap text-muted">{timeAgo(a.at)}</span>}
                        </a>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

/** One line on the water saved; the details are on Reports. Hidden until a field has a reading to project from. */
function SavingsLink() {
  const p = useProjection()
  const u = useUnits()
  if (!p.zones.length || p.saved.litres <= 0) return null
  return (
    <a href="#/reports" className="mt-3 flex items-center gap-2 rounded-xl bg-water-soft p-3 text-sm font-semibold hover:opacity-90">
      <TrendingDown aria-hidden className="size-5 shrink-0 text-water" />
      <span className="flex-1">About {u.volume(p.saved.litres)} less water over the next 14 days than a fixed schedule</span>
      <ChevronRight aria-hidden className="size-4" />
    </a>
  )
}
