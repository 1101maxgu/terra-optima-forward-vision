// App state (integrator-owned). Components read everything through useFarm().
// Persistence goes through FarmRepository (src/data/repo.ts); this file holds derived state.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Units } from '../ui/units'
import type {
  FarmData, FarmerStatus, FixedSchedule, Freshness, IrrigationEvent, Reading, Recommendation, Sensor, SensorAssessment, SensorReading, Weather, Zone,
} from '../types'
import sampleWeather from '../data/sampleWeather.json'
import { getWeather } from '../services/weather'
import { recommend } from '../engine/irrigation'
import { assessSensors } from '../engine/sensorTrust'
import { notifyTransitions, notifier } from '../engine/notify'
import { DEFAULT_COSTS, DEFAULT_SCHEDULE, type CostAssumptions } from '../engine/outcomes'
import { createRepository, newId, resetSample, type Dataset } from '../data/repo'
import { limitsFor, type Limits, type PlanId } from '../pricing/plans'
import { getFarmPlan, type FarmPlan } from '../services/billingApi'

export type WeatherMode = 'sample' | 'live'
export type SensorState = 'online' | 'offline' | 'never'

const BUNDLED: Weather = { days: sampleWeather.days, source: 'bundled', provenance: 'simulated' }
const H = 3600_000
/** Device readings: fresh ≤ 3 h, stale ≤ 24 h. Manual/CSV readings: fresh ≤ 24 h, stale ≤ 72 h. */
const WINDOWS = { device: [3 * H, 24 * H], manual: [24 * H, 72 * H] } as const
const isManual = (r: Pick<SensorReading, 'source'>) => r.source === 'manual' || r.source === 'csv'

export interface ZoneStatus {
  status: FarmerStatus
  freshness: Freshness
  moisturePct: number | null
  soilTempC: number | null
  lastUpdate: string | null
  rec?: Recommendation // undefined when there is no reading at all
  sensors: Sensor[]
  /** Probes left out because they look faulty. Non-empty with no rec means every probe was left out. */
  discounted: { sensorId: string; sensorName: string; reason: string }[]
}

/** Farmer's response to a flag, keyed by sensor. Stored with the signal kinds it covered so a new problem flags again. */
export type Acks = Record<string, { mode: 'fine' | 'ignore'; kinds: string[] }>

const UI_KEY = 'geoviva:ui:v2'
interface UiPrefs {
  dataset: Dataset
  weatherMode: WeatherMode
  acks: Acks
  outcomes: OutcomeSettings
  units: Units
}
/** Baseline schedule and cost assumptions for the outcomes report; editable in Settings. */
export interface OutcomeSettings {
  schedule: FixedSchedule
  costs: CostAssumptions
}
export const OUTCOME_DEFAULTS: OutcomeSettings = { schedule: DEFAULT_SCHEDULE, costs: DEFAULT_COSTS }
const UI_DEFAULTS: UiPrefs = { dataset: 'sample', weatherMode: 'sample', acks: {}, outcomes: OUTCOME_DEFAULTS, units: 'metric' }

/** Keeps only known, finite, non-negative numbers; anything else falls back to the default. */
export function cleanOutcomeSettings(p: unknown): OutcomeSettings {
  const o = (p && typeof p === 'object' ? p : {}) as Partial<Record<keyof OutcomeSettings, Record<string, unknown>>>
  const pick = <T extends object>(src: Record<string, unknown> | undefined, def: T): T =>
    Object.fromEntries(Object.entries(def).map(([k, v]) => {
      const x = src?.[k]
      return [k, typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : v]
    })) as T
  const schedule = pick(o.schedule, DEFAULT_SCHEDULE)
  return { schedule: { ...schedule, eventsPerWeek: Math.min(7, Math.round(schedule.eventsPerWeek)) }, costs: pick(o.costs, DEFAULT_COSTS) }
}
function loadUi(): UiPrefs {
  try {
    const raw = sessionStorage.getItem(UI_KEY)
    const p = raw ? JSON.parse(raw) : {}
    // Only known keys: older builds stored demo overrides here, which must not leak into statuses.
    return {
      dataset: p.dataset === 'mine' ? 'mine' : 'sample',
      weatherMode: p.weatherMode === 'live' ? 'live' : 'sample',
      acks: p.acks && typeof p.acks === 'object' ? p.acks : {},
      outcomes: cleanOutcomeSettings(p.outcomes),
      units: p.units === 'imperial' ? 'imperial' : 'metric',
    }
  } catch {
    return UI_DEFAULTS
  }
}

/** Applies the farmer's acknowledgements: an ack holds while the current signals are ones it already covered. */
export function applyAcks(raw: Record<string, SensorAssessment>, acks: Acks): Record<string, SensorAssessment> {
  const out: Record<string, SensorAssessment> = {}
  for (const [id, a] of Object.entries(raw)) {
    const ack = acks[id]
    out[id] = ack && a.signals.filter((x) => x.weight > 0).every((x) => ack.kinds.includes(x.kind)) ? { ...a, ack: ack.mode } : a
  }
  return out
}

/** A probe's readings stay out of recommendations while it looks faulty, unless the farmer marked it fine. */
export const isExcluded = (a?: SensorAssessment) => a?.verdict === 'likely-faulty' && a.ack !== 'fine'

export function freshnessOf(r: Pick<SensorReading, 'timestamp' | 'source'>, now: number): Freshness {
  const age = now - Date.parse(r.timestamp)
  const [fresh, stale] = isManual(r) ? WINDOWS.manual : WINDOWS.device
  return age <= fresh ? 'fresh' : age <= stale ? 'stale' : 'missing'
}

function useFarmState() {
  const [ui, setUi] = useState<UiPrefs>(loadUi)
  const [epoch, setEpoch] = useState(0) // bump to drop the repository's in-memory cache
  const repo = useMemo(() => createRepository(ui.dataset), [ui.dataset, epoch])
  const [data, setData] = useState<FarmData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [liveWeather, setLiveWeather] = useState<Weather | null>(null)
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    try {
      sessionStorage.setItem(UI_KEY, JSON.stringify(ui))
    } catch {
      /* storage unavailable: prefs still work in memory */
    }
  }, [ui])

  const [serverPlan, setServerPlan] = useState<FarmPlan | null>(null)
  const onServer = Boolean(import.meta.env.VITE_API_URL) && ui.dataset === 'mine'

  const reload = useCallback(async () => {
    try {
      setData(structuredClone(await repo.load()))
      setLoadError(null)
      // The server owns the plan for synced farms; refreshed with the data so new limits show after upgrades.
      if (onServer) getFarmPlan().then(setServerPlan, () => setServerPlan(null))
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load farm data')
    }
  }, [repo, onServer])

  useEffect(() => {
    setData(null)
    reload()
  }, [reload])

  // Re-evaluate freshness every minute without reloading data or maps.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (ui.weatherMode === 'live' && !liveWeather) getWeather(data?.farm.lat ?? 49.05, data?.farm.lon ?? -122.3).then(setLiveWeather)
  }, [ui.weatherMode, liveWeather, data?.farm.lat, data?.farm.lon])

  // A cached forecast can start in the past; the engine treats days[0] as today.
  const weather = useMemo(() => {
    if (ui.weatherMode !== 'live' || !liveWeather) return BUNDLED
    const today = new Date().toLocaleDateString('en-CA')
    const days = liveWeather.days.filter((d) => d.date >= today)
    return days.length >= 2 ? { ...liveWeather, days } : BUNDLED
  }, [ui.weatherMode, liveWeather])

  const zones = useMemo(() => data?.zones ?? [], [data])
  const sensors = useMemo(() => data?.sensors ?? [], [data])
  const readings = useMemo(() => data?.readings ?? [], [data])
  const events = useMemo(() => data?.events ?? [], [data])

  const rawAssessments = useMemo(() => assessSensors(sensors, readings, weather.days, events, now), [sensors, readings, weather, events, now])
  const assessments = useMemo(() => applyAcks(rawAssessments, ui.acks), [rawAssessments, ui.acks])
  const excluded = useMemo(() => new Set(Object.values(assessments).filter(isExcluded).map((a) => a.sensorId)), [assessments])

  // Phase 2 swaps the no-op notifier for a server-side sender; here it only fires on verdict changes.
  const prevAssessments = useRef<Record<string, SensorAssessment>>({})
  useEffect(() => {
    notifyTransitions(prevAssessments.current, assessments, notifier)
    prevAssessments.current = assessments
  }, [assessments])

  /** Current value per zone: average of each sensor's latest fresh reading, else the newest reading. */
  const zoneReading = useMemo(() => {
    const out: Record<string, { reading: Reading; freshness: Freshness; lastUpdate: string } | undefined> = {}
    for (const z of zones) {
      const latestBy = new Map<string, SensorReading>()
      for (const r of readings) {
        if (r.zoneId !== z.id || (r.sensorId && excluded.has(r.sensorId))) continue
        const k = r.sensorId ?? `manual:${r.source}`
        const prev = latestBy.get(k)
        if (!prev || Date.parse(r.timestamp) > Date.parse(prev.timestamp)) latestBy.set(k, r)
      }
      const latest = [...latestBy.values()].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
      if (!latest.length) continue
      const fresh = latest.filter((r) => freshnessOf(r, now) === 'fresh')
      const use = fresh.length ? fresh : [latest[0]]
      // ponytail: plain average across depths; weight by root-zone depth if probes vary a lot.
      const avg = (f: (r: SensorReading) => number | undefined) => {
        const v = use.map(f).filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
        return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN
      }
      out[z.id] = {
        reading: {
          zoneId: z.id, timestamp: use[0].timestamp, moisture: avg((r) => r.soilMoisturePercent) / 100,
          soilTempC: avg((r) => r.soilTemperatureC), provenance: use[0].source === 'sample' ? 'simulated' : 'measured',
        },
        freshness: fresh.length ? 'fresh' : freshnessOf(latest[0], now),
        lastUpdate: latest[0].timestamp,
      }
    }
    return out
  }, [zones, readings, now, excluded])

  const discountedIn = useCallback(
    (zoneId: string) => sensors
      .filter((s) => s.zoneId === zoneId && excluded.has(s.id))
      .map((s) => ({ sensorId: s.id, sensorName: s.name, reason: assessments[s.id].explanation })),
    [sensors, excluded, assessments],
  )

  const recommendations = useMemo(() => {
    const out: Record<string, Recommendation> = {}
    for (const z of zones) {
      const zr = zoneReading[z.id]
      if (!zr) continue
      const rec = recommend(z, zr.reading, weather.days)
      const used = sensors.filter((s) => s.zoneId === z.id && !excluded.has(s.id) && assessments[s.id])
      const discounted = discountedIn(z.id)
      rec.confidence = used.length ? Math.min(...used.map((s) => assessments[s.id].ack === 'fine' ? 1 : assessments[s.id].confidence)) : 1
      rec.discounted = discounted
      for (const d of discounted)
        rec.factors.push({ label: `${d.sensorName} left out`, value: d.reason, effect: 'neutral', provenance: 'estimated' })
      out[z.id] = rec
    }
    return out
  }, [zones, zoneReading, weather, sensors, excluded, assessments, discountedIn])

  const zoneStatus = useCallback(
    (zoneId: string): ZoneStatus => {
      const zr = zoneReading[zoneId]
      const rec = recommendations[zoneId]
      const freshness: Freshness = zr?.freshness ?? 'missing'
      const status: FarmerStatus = !rec || freshness !== 'fresh'
        ? 'check-sensor'
        : rec.status === 'irrigate-now' ? 'water-today' : rec.status === 'irrigate-soon' ? 'water-soon' : 'no-water'
      const moisture = zr?.reading.moisture
      return {
        status, freshness, rec,
        moisturePct: moisture === undefined ? null : Math.round(moisture * 1000) / 10,
        soilTempC: zr && Number.isFinite(zr.reading.soilTempC) ? Math.round(zr.reading.soilTempC * 10) / 10 : null,
        lastUpdate: zr?.lastUpdate ?? null,
        sensors: sensors.filter((s) => s.zoneId === zoneId),
        discounted: discountedIn(zoneId),
      }
    },
    [zoneReading, recommendations, sensors, discountedIn],
  )

  const sensorState = useCallback(
    (s: Sensor): SensorState => (!s.lastSeen ? 'never' : now - Date.parse(s.lastSeen) <= WINDOWS.device[0] ? 'online' : 'offline'),
    [now],
  )

  const patchUi = (p: Partial<UiPrefs>) => setUi((s) => ({ ...s, ...p }))
  const farmId = data?.farm.id ?? 'my-farm'

  // Mutations persist first, then refresh; they throw on failure so forms can keep input and offer Retry.
  const run = async <T,>(op: Promise<T>): Promise<T> => {
    const v = await op
    await reload()
    return v
  }

  return {
    loading: !data && !loadError,
    loadError,
    reload,
    dataset: ui.dataset,
    /** null on the Sample farm (no limits in the demo). Synced farms: the server's plan. On this device: Free. */
    plan: (ui.dataset === 'sample' ? null : onServer ? (serverPlan?.plan ?? 'free') : 'free') as PlanId | null,
    limits: (ui.dataset === 'sample' ? null : onServer && serverPlan ? serverPlan : limitsFor('free')) as Limits | null,
    serverPlan,
    setDataset: (dataset: Dataset) => patchUi({ dataset }),
    farm: data?.farm ?? { id: farmId, name: '', location: '', lat: 49.05, lon: -122.3 },
    updateFarm: (f: Partial<FarmData['farm']>) => run(repo.updateFarm({ ...data!.farm, ...f })),
    zones,
    sensors,
    readings,
    events,
    zoneStatus,
    sensorState,
    /** Engine-shaped current reading for a zone, or null if none. */
    latestReading: (zoneId: string): Reading | null => zoneReading[zoneId]?.reading ?? null,
    recommendations,
    /** Trust verdict per sensor id; missing when the sensor has no recent readings. */
    assessments,
    /** Farmer's response to a flag. 'fine' puts the probe back into recommendations; 'ignore' only silences alerts. */
    acknowledge: (sensorId: string, mode: 'fine' | 'ignore' | null) => {
      const a = assessments[sensorId]
      const acks = { ...ui.acks }
      if (mode && a) acks[sensorId] = { mode, kinds: a.signals.filter((x) => x.weight > 0).map((x) => x.kind) }
      else delete acks[sensorId]
      patchUi({ acks })
    },

    outcomeSettings: ui.outcomes,
    setOutcomeSettings: (o: OutcomeSettings) => patchUi({ outcomes: cleanOutcomeSettings(o) }),

    createZone: (z: Omit<Zone, 'id' | 'farmId'>) => run(repo.saveZone({ ...z, id: newId(), farmId })),
    updateZone: (id: string, patch: Partial<Zone>) => {
      const z = zones.find((x) => x.id === id)
      if (!z) return Promise.reject(new Error('Field section not found'))
      return run(repo.saveZone({ ...z, ...patch }))
    },
    deleteZone: (id: string) => run(repo.deleteZone(id)),

    saveSensor: (s: Omit<Sensor, 'id' | 'farmId' | 'createdAt'> & { id?: string }) => {
      const existing = s.id ? sensors.find((x) => x.id === s.id) : undefined
      return run(repo.saveSensor({ ...existing, ...s, id: s.id ?? newId(), farmId, createdAt: existing?.createdAt ?? new Date().toISOString() } as Sensor))
    },
    assignSensor: (sensorId: string, zoneId: string | null) => {
      const s = sensors.find((x) => x.id === sensorId)
      if (!s) return Promise.reject(new Error('Sensor not found'))
      return run(repo.saveSensor({ ...s, zoneId }))
    },
    deleteSensor: (id: string) => run(repo.deleteSensor(id)),

    /** Manual reading for a zone; pass sensorId to record it against a manual sensor. */
    addManualReading: (zoneId: string, moisturePercent: number, soilTemperatureC?: number, sensorId: string | null = null) =>
      run(repo.addReading({ id: newId(), sensorId, zoneId, timestamp: new Date().toISOString(), soilMoisturePercent: moisturePercent, soilTemperatureC, source: 'manual' })),
    /** CSV rows (engine-shaped) become normalized readings with source 'csv'. */
    importReadings: async (rows: Reading[]) => {
      for (const r of rows)
        await repo.addReading({ id: newId(), sensorId: null, zoneId: r.zoneId, timestamp: r.timestamp, soilMoisturePercent: Math.round(r.moisture * 1000) / 10, soilTemperatureC: Number.isFinite(r.soilTempC) ? r.soilTempC : undefined, source: 'csv' })
      await reload()
    },
    logIrrigation: (e: Omit<IrrigationEvent, 'id'>) => run(repo.addEvent({ ...e, id: newId(), source: 'manual' })),

    weather,
    weatherMode: ui.weatherMode,
    weatherLabel: weather.source === 'bundled' ? sampleWeather.label : `Live forecast (${weather.source})`,
    setWeatherMode: (weatherMode: WeatherMode) => patchUi({ weatherMode }),
    units: ui.units,
    setUnits: (units: Units) => patchUi({ units }),
    /** Regenerates the sample farm. Never touches the farmer's own data. */
    resetDemo: () => {
      resetSample()
      patchUi({ weatherMode: 'sample' })
      setEpoch((e) => e + 1)
    },
  }
}

export type FarmStore = ReturnType<typeof useFarmState>
const Ctx = createContext<FarmStore | null>(null)

export function FarmProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={useFarmState()}>{children}</Ctx.Provider>
}

export function useFarm(): FarmStore {
  const v = useContext(Ctx)
  if (!v) throw new Error('useFarm must be used inside <FarmProvider>')
  return v
}
