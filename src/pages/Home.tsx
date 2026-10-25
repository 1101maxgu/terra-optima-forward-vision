import { Suspense } from 'react'
import { Activity, Bell, CalendarClock, ChartColumn, ChevronRight, CircleHelp, CloudSun, Droplets, Map as MapIcon, Play, Plus, Radio, Sprout, Tag, TrendingDown } from 'lucide-react'
import { useFarm, type ZoneStatus } from '../state/farmStore'
import type { Zone } from '../types'
import { FarmMap, MapSkeleton } from '../map'
import { formatArea } from '../map/geo'
import { splitSessions } from '../engine/irrigation'
import { CROPS } from '../data/crops'
import { navigate } from '../router'
import { Card, SampleBanner, StatusPill, fmtLitres, fmtPct, timeAgo } from '../ui/kit'
import { CROP_EMOJI, STATUS_RANK, bestTime, greeting, shortName, useAlerts, useProjection } from '../ui/farm'
import { ForecastMini, SectionTitle, StatCard, dayLook } from '../ui/widgets'
import { ALERT_ICON } from '../components/shell/TopBar'
import ProvenanceBadge from '../components/ProvenanceBadge'

type Row = { z: Zone; st: ZoneStatus }

function checkReason(st: ZoneStatus) {
  if (!st.lastUpdate && st.discounted.length) return 'Probe looks faulty'
  if (!st.lastUpdate) return 'No readings yet'
  if (st.freshness === 'stale') return `Readings stale, last ${timeAgo(st.lastUpdate)}`
  return `No recent data, last ${timeAgo(st.lastUpdate)}`
}

function Amount({ st, z }: Row) {
  if (st.status === 'check-sensor') return <span className="text-stale">{checkReason(st)}</span>
  const rec = st.rec
  if (!rec || rec.grossMm <= 0) return <span className="text-muted">Not needed</span>
  const split = rec.grossMm > 20 ? splitSessions(rec.grossMm, z.areaM2) : null
  return (
    <span>
      <span className="font-semibold tabular-nums">{rec.grossMm} mm</span> <span className="text-muted tabular-nums">({fmtLitres(rec.litres)})</span>
      {split && (
        <span className="block text-sm text-muted">
          Split into {split.sessions} × {split.mmEach} mm
        </span>
      )}
    </span>
  )
}

export default function Home() {
  const { farm, zones, sensors, readings, weather, dataset, setDataset, zoneStatus, sensorState } = useFarm()
  const alerts = useAlerts()
  const rows: Row[] = zones.map((z) => ({ z, st: zoneStatus(z.id) }))
  const byUrgency = [...rows].sort((a, b) => STATUS_RANK[a.st.status] - STATUS_RANK[b.st.status] || (b.st.rec?.grossMm ?? 0) - (a.st.rec?.grossMm ?? 0))

  const online = sensors.filter((s) => sensorState(s) === 'online').length
  const offline = sensors.filter((s) => sensorState(s) === 'offline').length
  const fresh = rows.filter((r) => r.st.freshness === 'fresh' && r.st.moisturePct !== null)
  const avgMoisture = fresh.length ? fresh.reduce((t, r) => t + (r.st.moisturePct ?? 0), 0) / fresh.length : null
  const next = byUrgency.find((r) => r.st.status === 'water-today') ?? byUrgency.find((r) => r.st.status === 'water-soon')
  const today = weather.days[0]
  const look = today ? dayLook(today) : null
  const weatherSrc = weather.source === 'bundled' ? 'Sample weather' : 'Live forecast'

  const zoneName = (id: string) => zones.find((z) => z.id === id)?.name ?? 'Unassigned'
  const latest = sensors
    .map((s) => ({ s, r: readings.filter((r) => r.sensorId === s.id).reduce<(typeof readings)[number] | undefined>((m, r) => (!m || r.timestamp > m.timestamp ? r : m), undefined) }))
    .filter((x) => x.r)
    .sort((a, b) => Date.parse(b.r!.timestamp) - Date.parse(a.r!.timestamp))
    .slice(0, 6)

  const statuses = Object.fromEntries(rows.map(({ z, st }) => [z.id, { status: st.status, label: fmtPct(st.moisturePct) }]))

  return (
    <div className="flex flex-col gap-5">
      {dataset === 'sample' && <SampleBanner />}
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
            <Plus aria-hidden className="size-5 shrink-0" /> <span>Create new field section</span>
          </a>
          <a href="#/sensors" className="btn-secondary inline-flex min-h-12 items-center justify-center gap-2 text-center">
            <Radio aria-hidden className="size-5 shrink-0" /> <span>Add sensor</span>
          </a>
          <a href="#/reports" className="btn-secondary inline-flex min-h-12 items-center justify-center gap-2 text-center">
            <ChartColumn aria-hidden className="size-5 shrink-0" /> <span>View report</span>
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5 [&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1">
        <StatCard icon={<Sprout className="size-6" />} tone="bg-leaf-soft text-leaf" value={zones.length} label="Total field sections" sub={`${rows.filter((r) => r.z.boundary).length} mapped`} />
        <StatCard
          icon={<Radio className="size-6" />}
          tone="bg-water-soft text-water"
          value={online}
          label="Active sensors"
          sub={offline > 0 ? <span className="font-semibold text-alert">{offline} offline</span> : `of ${sensors.length} total`}
        />
        <StatCard
          icon={<Droplets className="size-6" />}
          tone="bg-water-soft text-water"
          value={fmtPct(avgMoisture)}
          label="Average soil moisture"
          sub={fresh.length ? `${fresh.length} field section${fresh.length === 1 ? '' : 's'} reporting` : 'No fresh readings'}
        />
        <StatCard
          icon={<CalendarClock className="size-6" />}
          tone={next?.st.status === 'water-today' ? 'bg-alert-soft text-alert' : 'bg-sun-soft text-sun'}
          value={next ? (next.st.status === 'water-today' ? 'Today' : 'Within 48 h') : 'None due'}
          label="Next irrigation"
          sub={next?.st.rec ? `${shortName(next.z.name)} · ${next.st.rec.grossMm} mm` : 'No field section needs water now'}
        />
        <StatCard
          icon={look ? <look.Icon className="size-6" /> : <CloudSun className="size-6" />}
          tone="bg-sun-soft text-sun"
          value={today ? `${Math.round(today.tMaxC)}°C` : '—'}
          label="Today's weather"
          sub={look ? `${look.word} · ${weather.source === 'bundled' ? 'sample' : 'live'}` : weatherSrc}
        />
      </div>

      <OutcomeTile />

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
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
          <Card className="">
            <SectionTitle icon={<MapIcon aria-hidden className="size-5 text-leaf" />} title="Farm overview" action={<a href="#/zones">All field sections →</a>} />
            <Suspense fallback={<MapSkeleton className="h-72 md:h-[420px]" />}>
              <FarmMap
                zones={zones}
                statuses={statuses}
                sensors={sensors}
                onZoneClick={(id) => navigate(`/zones/${id}`)}
                fallbackCenter={[farm.lon, farm.lat]}
                className="h-72 md:h-[420px]"
              />
            </Suspense>
          </Card>
          <Card>
            <SectionTitle icon={<Sprout aria-hidden className="size-5 text-leaf" />} title="Field sections" action={<a href="#/zones">View all →</a>} />
            <ul className="-mx-2 divide-y divide-line">
              {byUrgency.map(({ z, st }) => (
                <li key={z.id}>
                  <a href={`#/zones/${z.id}`} className="flex min-h-16 items-center gap-3 rounded-xl px-2 py-2 hover:bg-paper">
                    <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-paper text-2xl">
                      {CROP_EMOJI[z.cropId]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{shortName(z.name)}</span>
                      <span className="block text-sm text-muted">
                        {CROPS[z.cropId].name} · {formatArea(z.areaM2)}
                      </span>
                      <span className="mt-1 block">
                        <StatusPill status={st.status} size="sm" />
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-xl font-bold tabular-nums">{fmtPct(st.moisturePct)}</span>
                      <span className="block text-xs text-muted">moisture</span>
                    </span>
                    <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-[1.25fr_1fr_0.85fr]">
        {zones.length > 0 && (
          <Card>
            <SectionTitle icon={<Droplets aria-hidden className="size-5 text-water" />} title="Today's irrigation recommendations" />
            <table className="hidden w-full text-left md:table">
              <thead className="border-b border-line text-sm text-muted">
                <tr>
                  <th className="py-2 pr-2 font-medium">Field section</th>
                  <th className="py-2 pr-2 font-medium">Recommended</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {byUrgency.map((r) => (
                  <tr key={r.z.id} className="cursor-pointer align-top hover:bg-paper" onClick={() => navigate(`/zones/${r.z.id}`)}>
                    <td className="py-3 pr-2">
                      <a href={`#/zones/${r.z.id}`} className="font-semibold">
                        {shortName(r.z.name)}
                      </a>
                      <div className="text-sm text-muted">
                        <span aria-hidden>{CROP_EMOJI[r.z.cropId]}</span> {CROPS[r.z.cropId].name}
                      </div>
                    </td>
                    <td className="py-3 pr-2 text-sm">
                      <Amount {...r} />
                      {r.st.status !== 'check-sensor' && r.st.rec && r.st.rec.grossMm > 0 && <div className="text-muted">{bestTime(r.st.rec)}</div>}
                    </td>
                    <td className="py-3">
                      <StatusPill status={r.st.status} size="sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="flex flex-col gap-3 md:hidden">
              {byUrgency.map((r) => (
                <li key={r.z.id}>
                  <a href={`#/zones/${r.z.id}`} className="block rounded-xl border border-line p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-lg font-semibold">{r.z.name}</div>
                        <div className="text-muted">
                          <span aria-hidden>{CROP_EMOJI[r.z.cropId]}</span> {CROPS[r.z.cropId].name}
                        </div>
                      </div>
                      <StatusPill status={r.st.status} />
                    </div>
                    <div className="mt-2 text-lg">
                      <Amount {...r} />
                    </div>
                    {r.st.status !== 'check-sensor' && r.st.rec && r.st.rec.grossMm > 0 && <div className="text-muted">{bestTime(r.st.rec)}</div>}
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card>
          <SectionTitle icon={<Activity aria-hidden className="size-5 text-water" />} title="Recent sensor readings" action={<a href="#/sensors">View all →</a>} />
          {latest.length === 0 ? (
            <p className="text-muted">No sensor readings yet. Add a sensor or import readings in Settings.</p>
          ) : (
            <table className="w-full text-left">
              <thead className="border-b border-line text-sm text-muted">
                <tr>
                  <th className="py-2 pr-2 font-medium">Sensor</th>
                  <th className="py-2 pr-2 font-medium">Moisture</th>
                  <th className="py-2 pr-2 font-medium">Temp</th>
                  <th className="py-2 text-right font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {latest.map(({ s, r }) => {
                  const stale = sensorState(s) !== 'online'
                  return (
                    <tr key={s.id} className="align-top">
                      <td className="py-2.5 pr-2">
                        <span className="flex items-center gap-2 font-semibold">
                          <span className={`size-2.5 shrink-0 rounded-full ${stale ? 'bg-stale' : 'bg-leaf'}`} aria-hidden />
                          {s.name}
                        </span>
                        <span className="block pl-4.5 text-sm text-muted">{shortName(zoneName(r!.zoneId))}</span>
                      </td>
                      <td className="py-2.5 pr-2 font-semibold tabular-nums">{fmtPct(r!.soilMoisturePercent)}</td>
                      <td className="py-2.5 pr-2 text-muted tabular-nums">{typeof r!.soilTemperatureC === 'number' ? `${r!.soilTemperatureC.toFixed(0)}°C` : '—'}</td>
                      <td className={`py-2.5 text-right text-sm ${stale ? 'font-semibold text-stale' : 'text-muted'}`}>
                        {stale && <span className="block">Stale</span>}
                        {timeAgo(r!.timestamp)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Card>

        <div className="flex flex-col gap-5 lg:col-span-2 lg:grid lg:grid-cols-2 2xl:col-span-1 2xl:flex">
          <Card>
            <SectionTitle icon={<CloudSun aria-hidden className="size-5 text-sun" />} title="Weather forecast" action={<a href="#/weather">Details →</a>} />
            <p className="mb-2 text-sm text-muted">
              {farm.location || 'Farm location'} · {weatherSrc}
            </p>
            <ForecastMini days={weather.days.slice(0, 4)} />
          </Card>
          <Card>
            <SectionTitle icon={<Bell aria-hidden className="size-5 text-alert" />} title="Alerts & notifications" />
            {alerts.length === 0 ? (
              <p className="text-muted">All clear. Nothing needs your attention.</p>
            ) : (
              <ul className="-mx-2 flex flex-col">
                {alerts.slice(0, 5).map((a) => {
                  const { Icon, cls } = ALERT_ICON[a.level]
                  return (
                    <li key={a.id}>
                      <a href={`#${a.href}`} className="flex min-h-12 items-start gap-3 rounded-xl px-2 py-2 text-sm hover:bg-paper">
                        <Icon aria-hidden className={`size-5 shrink-0 ${cls}`} />
                        <span className="flex-1">{a.text}</span>
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
    </div>
  )
}

/** One-line projected outcome; details on Reports. Hidden until a zone has a reading to project from. */
function OutcomeTile() {
  const p = useProjection()
  if (!p.zones.length) return null
  const s = p.saved
  return (
    <a href="#/reports" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-line bg-surface p-3.5 hover:bg-paper">
      <TrendingDown aria-hidden className="size-6 shrink-0 text-water" />
      <span className="font-semibold">Next 14 days vs a fixed schedule:</span>
      <span className="tabular-nums">
        {s.litres >= 0 ? `${fmtLitres(s.litres)} less water` : `${fmtLitres(-s.litres)} more water`} · {s.events >= 0 ? `${s.events} fewer waterings` : `${-s.events} more waterings`} · {Math.round(s.labourH * 10) / 10} h labour
      </span>
      <ProvenanceBadge p="projected" />
      <span className="ml-auto inline-flex items-center gap-1 font-semibold text-leaf">See report <ChevronRight aria-hidden className="size-4" /></span>
    </a>
  )
}
