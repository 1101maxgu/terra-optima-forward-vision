import { Suspense } from 'react'
import { AlertTriangle, BatteryMedium, CalendarDays, ChevronRight, CloudRain, CloudSun, Layers, MapPinned, Radio, Sun, Thermometer } from 'lucide-react'
import type { Zone } from '../../types'
import { useFarm, type ZoneStatus } from '../../state/farmStore'
import { navigate } from '../../router'
import { Card, FreshnessText, STATUS_HEX, StatusPill, fmtLitres, timeAgo } from '../../ui/kit'
import { FarmMap, MapSkeleton } from '../../map'
import { formatArea, pointInPolygon } from '../../map/geo'
import { CROPS } from '../../data/crops'
import { SOILS } from '../../data/soils'
import { EFFICIENCY, splitSessions } from '../../engine/irrigation'
import WhyPanel from '../WhyPanel'
import Luke from '../../guide/Luke'
import TrustBadge, { TrustPanel, confidenceWord } from '../TrustBadge'
import { RingGauge } from './parts'
import { SOIL_DRAINAGE, SOIL_TEXT } from './helpers'

const H2 = 'text-base font-bold'

/** Why a zone is in "Check sensor", in plain words. */
export function checkReason(zs: ZoneStatus, offline: number): string {
  const parts: string[] = []
  if (!zs.lastUpdate && zs.discounted.length) parts.push(`Every probe in this zone looks faulty, so there is no reading to trust. ${zs.discounted[0].reason}`)
  else if (!zs.lastUpdate) parts.push('No soil moisture readings yet. Add a manual reading or connect a sensor.')
  else if (zs.freshness !== 'fresh') parts.push(`The latest reading is from ${timeAgo(zs.lastUpdate)}, too old to base a watering decision on.`)
  if (offline) parts.push(`${offline} sensor${offline > 1 ? 's are' : ' is'} offline.`)
  return parts.join(' ')
}

/** Plain-language recommendation; shared by Overview and Irrigation tabs. */
export function RecommendationCard({ zone, zs, onAddReading }: { zone: Zone; zs: ZoneStatus; onAddReading: () => void }) {
  const { sensorState } = useFarm()
  const rec = zs.rec
  const offline = zs.sensors.filter((s) => sensorState(s) !== 'online').length
  const check = zs.status === 'check-sensor'
  const split = rec && rec.grossMm > 20 ? splitSessions(rec.grossMm, zone.areaM2) : null
  const watering = rec && rec.grossMm > 0

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={H2}>Recommendation</h2>
        <StatusPill status={zs.status} size="lg" />
      </div>
      {check && (
        <div className="mt-4 rounded-xl border border-stale/30 bg-stale-soft p-3">
          <p className="flex gap-2 font-medium"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-stale" aria-hidden />{checkReason(zs, offline)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-primary min-h-11" onClick={onAddReading}>Add a reading</button>
            <a href="#/sensors" className="btn-secondary inline-flex min-h-11 items-center">Check sensors</a>
          </div>
        </div>
      )}
      {rec && (
        <div className={check ? 'mt-4 opacity-70' : 'mt-4'}>
          {check && zs.lastUpdate && <p className="mb-2 text-sm text-muted">Based on the last reading ({timeAgo(zs.lastUpdate)}) — confirm before acting:</p>}
          {watering ? (
            <dl className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-water-soft p-3">
                <dt className="text-sm text-muted">Apply</dt>
                <dd className="text-3xl font-bold tabular-nums text-water">{rec.grossMm} mm</dd>
              </div>
              <div className="rounded-xl bg-water-soft p-3">
                <dt className="text-sm text-muted">Volume</dt>
                <dd className="text-3xl font-bold tabular-nums text-water">{fmtLitres(rec.litres)}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-2xl font-bold">No water needed for the next 48 h</p>
          )}
          {split && split.sessions > 1 && (
            <p className="mt-3 text-sm">Split into <b>{split.sessions} sessions</b> of about {split.mmEach} mm ({fmtLitres(split.litresEach)} each) to avoid runoff.</p>
          )}
          <p className="mt-3"><span className="text-muted">Best time: </span><b>{rec.timing}</b></p>
          <p className="mt-2 text-muted">{rec.summary}</p>
          {!check && <Hedge zs={zs} />}
        </div>
      )}
    </Card>
  )
}

/** Says plainly when the advice rests on readings we don't fully trust. */
function Hedge({ zs }: { zs: ZoneStatus }) {
  const rec = zs.rec!
  const lowConf = (rec.confidence ?? 1) < 0.75
  if (!lowConf && !rec.discounted?.length) return null
  return (
    <p className="mt-3 flex gap-2 rounded-xl border border-sun/30 bg-sun-soft p-3 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-sun" aria-hidden />
      <span>
        {rec.discounted?.length ? `${rec.discounted.map((d) => d.sensorName).join(', ')} left out because ${rec.discounted.length > 1 ? 'they look' : 'it looks'} faulty. ` : ''}
        {lowConf ? `I only partly trust the readings behind this advice (confidence ${confidenceWord(rec.confidence!)}); take a manual reading before acting.` : 'Advice is based on the remaining probes.'}
      </span>
    </p>
  )
}

const WHEN: Record<ZoneStatus['status'], string> = {
  'water-today': 'Today',
  'water-soon': 'In 1–2 days',
  'no-water': 'Not needed',
  'check-sensor': 'Check sensor',
}

export default function Overview({ zone, zs, onAddReading, onViewData }: { zone: Zone; zs: ZoneStatus; onAddReading: () => void; onViewData: () => void }) {
  const { farm, sensorState, weather, weatherLabel, assessments } = useFarm()
  const soil = SOILS[zone.soilId]
  const crop = CROPS[zone.cropId]
  const rec = zs.rec
  const placed = zs.sensors.filter((s) => s.lat !== undefined && s.lon !== undefined)
  const outside = zone.boundary ? placed.filter((s) => !pointInPolygon(s.lon!, s.lat!, zone.boundary!)) : []
  const offline = zs.sensors.filter((s) => sensorState(s) !== 'online').length
  const today = weather.days[0]
  const rain48 = Math.round(weather.days.slice(0, 2).reduce((s, d) => s + (Number.isFinite(d.rainMm) ? d.rainMm : 0), 0) * 10) / 10
  const wx = rain48 >= 3
    ? { Icon: CloudRain, chip: 'Rain expected', cls: 'bg-water-soft text-water', ic: 'text-water' }
    : today && today.et0Mm > 5
      ? { Icon: Sun, chip: 'Hot and dry', cls: 'bg-sun-soft text-sun', ic: 'text-sun' }
      : { Icon: CloudSun, chip: 'Good conditions', cls: 'bg-leaf-soft text-leaf', ic: 'text-sun' }
  const refill = (rec?.refillMoisture ?? soil.wiltingPoint) * 100
  const fc = soil.fieldCapacity * 100

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <section className="flex flex-col gap-2" aria-label="Zone map">
          {zone.boundary ? (
            <div className="relative">
              <Suspense fallback={<MapSkeleton className="h-64 sm:h-80" />}>
                <FarmMap
                  zones={[zone]}
                  statuses={{ [zone.id]: { status: zs.status, label: formatArea(zone.areaM2) } }}
                  sensors={placed}
                  selectedZoneId={zone.id}
                  fit="selected"
                  fallbackCenter={[farm.lon, farm.lat]}
                  className="h-64 overflow-hidden rounded-2xl sm:h-80"
                />
              </Suspense>
            </div>
          ) : (
            <div className="grid h-64 place-items-center rounded-2xl border border-dashed border-line bg-surface p-4 text-center sm:h-80">
              <div>
                <MapPinned className="mx-auto size-8 text-muted" aria-hidden />
                <p className="mt-2 font-semibold">Map boundary not set</p>
                <button type="button" className="btn-primary mt-3 min-h-11" onClick={() => navigate(`/zones/${zone.id}/boundary`)}>Add boundary</button>
              </div>
            </div>
          )}
          {outside.map((s) => (
            <p key={s.id} role="alert" className="flex gap-2 rounded-lg border border-sun/40 bg-sun-soft p-2 text-sm">
              <AlertTriangle className="size-4 shrink-0 text-sun" aria-hidden />
              <span><b>{s.name}:</b> Sensor location appears outside this zone.</span>
            </p>
          ))}
        </section>

        <Card className="order-first flex flex-col lg:order-none">
          <h2 className={H2}>Current soil moisture</h2>
          <div className="mt-3 flex flex-1 flex-wrap items-center justify-center gap-5 sm:flex-nowrap">
            <RingGauge value={zs.moisturePct} refill={refill} fc={fc} color={STATUS_HEX[zs.status]} />
            <div className="flex min-w-0 flex-col items-start gap-2">
              <StatusPill status={zs.status} size="lg" />
              <p className="text-sm text-muted">Target: <b className="text-ink">{Math.round(refill)}–{Math.round(fc)}%</b></p>
              {zs.soilTempC !== null && <p className="flex items-center gap-1 text-sm text-muted"><Thermometer className="size-4" aria-hidden />Soil {zs.soilTempC} °C</p>}
              <p className="text-sm"><FreshnessText freshness={zs.freshness} lastUpdate={zs.lastUpdate} /></p>
            </div>
          </div>
          {zs.status === 'check-sensor' && (
            <p className="mt-3 flex gap-2 rounded-lg bg-stale-soft p-2 text-sm font-medium"><AlertTriangle className="size-4 shrink-0 text-stale" aria-hidden />{checkReason(zs, offline)}</p>
          )}
          <button type="button" onClick={onViewData} className="mt-4 min-h-11 rounded-lg bg-leaf px-4 font-semibold text-surface transition hover:bg-forest">View sensor data</button>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <h2 className={H2}>Next irrigation</h2>
          <div className="mt-3 flex items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-water-soft text-water"><CalendarDays className="size-7" aria-hidden /></span>
            <div>
              <p className="text-xl font-bold">{WHEN[zs.status]}</p>
              {rec && rec.grossMm > 0 && zs.status !== 'check-sensor' ? (
                <>
                  <p className="font-semibold tabular-nums">{rec.grossMm} mm</p>
                  <p className="text-sm text-muted tabular-nums">(≈ {fmtLitres(rec.litres)})</p>
                </>
              ) : (
                <p className="text-sm text-muted">{zs.status === 'check-sensor' ? 'Needs a fresh moisture reading' : 'Soil has enough water for 48 h'}</p>
              )}
            </div>
          </div>
        </Card>
        <Card>
          <h2 className={H2}>Weather forecast</h2>
          {today ? (
            <div className="mt-3 flex items-center gap-3">
              <wx.Icon className={`size-12 shrink-0 ${wx.ic}`} aria-hidden />
              <div>
                <p className="text-xl font-bold tabular-nums">{Math.round(today.tMaxC)}°C <span className="text-base font-normal text-muted">/ {Math.round(today.tMinC)}°</span></p>
                <p className="text-sm text-muted tabular-nums">Rain next 48 h: {rain48} mm</p>
                <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-sm font-semibold ${wx.cls}`}>{wx.chip}</span>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-muted">No forecast available.</p>
          )}
          <p className="mt-2 text-xs text-muted">{weatherLabel}</p>
        </Card>
        <Card>
          <h2 className={H2}>Soil conditions</h2>
          <div className="mt-3 flex items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-sun-soft text-sun"><Layers className="size-7" aria-hidden /></span>
            <div>
              <p className="text-xl font-bold">{soil.name}</p>
              <p className="font-medium">{SOIL_DRAINAGE[soil.id]}</p>
              <p className="text-sm text-muted">{rec ? `Holds ${Math.round(rec.tawMm)} mm in the root zone` : SOIL_TEXT[soil.id]}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <RecommendationCard zone={zone} zs={zs} onAddReading={onAddReading} />
        <div className="flex flex-col gap-4">
          <Card>
            <div className="flex items-center justify-between">
              <h2 className={H2}>Connected sensors</h2>
              <a href="#/sensors" className="inline-flex min-h-11 items-center gap-1 font-medium text-leaf">Manage <ChevronRight className="size-4" aria-hidden /></a>
            </div>
            {zs.sensors.length === 0 ? (
              <div className="mt-2 flex items-start gap-2">
                <Luke className="size-9 shrink-0" />
                <p className="text-muted">No sensors assigned to this zone. <a className="font-medium text-leaf underline" href="#/sensors">Connect a sensor</a> or add manual readings. <a className="font-medium text-water underline" href="#/help/hardware">How to install one</a></p>
              </div>
            ) : (
              <ul className="mt-1 divide-y divide-line">
                {zs.sensors.map((s) => {
                  const st = sensorState(s)
                  return (
                    <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                      <Radio className="size-5 text-muted" aria-hidden />
                      <span className="font-semibold">{s.name}</span>
                      <span className="text-sm text-muted">{s.depthCm} cm</span>
                      <TrustBadge a={assessments[s.id]} />
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st === 'online' ? 'bg-leaf-soft text-leaf' : 'bg-stale-soft text-stale'}`}>
                        {st === 'online' ? 'Online' : st === 'offline' ? 'Offline' : 'Never connected'}
                      </span>
                      {s.batteryPercent !== undefined && (
                        <span className={`flex items-center gap-1 text-sm ${s.batteryPercent < 20 ? 'font-semibold text-alert' : 'text-muted'}`}>
                          <BatteryMedium className="size-4" aria-hidden />{s.batteryPercent}%
                        </span>
                      )}
                      <span className="text-sm text-muted sm:ml-auto">{s.lastSeen ? `Seen ${timeAgo(s.lastSeen)}` : 'Never seen'}</span>
                      <TrustPanel a={assessments[s.id]} className="w-full" />
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
          <details className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
            <summary className="min-h-11 cursor-pointer content-center font-semibold">Advanced details (FAO-56)</summary>
            {rec ? (
              <div className="mt-3 flex flex-col gap-4">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {[
                    ['Total available water (TAW)', `${rec.tawMm} mm`],
                    ['Readily available water (RAW)', `${rec.rawMm} mm`],
                    ['Current depletion', `${rec.depletionMm} mm`],
                    ['Projected depletion (48 h)', `${rec.projectedDepletionMm} mm`],
                    ['Refill point', `${Math.round(rec.refillMoisture * 1000) / 10}%`],
                    ['Field capacity', `${Math.round(soil.fieldCapacity * 100)}%`],
                    ['Crop coefficient (Kc)', String(crop.kc)],
                    ['Root depth', `${zone.rootDepthMm ?? crop.rootDepthMm} mm`],
                    ['Irrigation efficiency', `${Math.round((zone.efficiency ?? EFFICIENCY[zone.method]) * 100)}%`],
                    ['Net depth needed', `${rec.netMm} mm`],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-muted">{k}</dt>
                      <dd className="font-semibold tabular-nums">{v}</dd>
                    </div>
                  ))}
                </dl>
                <WhyPanel factors={rec.factors} confidence={rec.confidence} />
              </div>
            ) : (
              <p className="mt-2 text-muted">Available once this zone has a soil moisture reading.</p>
            )}
          </details>
        </div>
      </div>
    </div>
  )
}
