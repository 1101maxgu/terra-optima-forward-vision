// App state (integrator-owned). Components read everything through useFarm().
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { FixedSchedule, Reading, Recommendation, ScenarioOverrides, WaterComparison, Weather, Zone } from '../types'
import { SAMPLE_FARM, SAMPLE_READINGS } from '../data/sampleFarm'
import sampleWeather from '../data/sampleWeather.json'
import { getWeather } from '../services/weather'
import { recommend, simulateWater } from '../engine/irrigation'
import { SOILS } from '../data/soils'

export type WeatherMode = 'sample' | 'live'

const BUNDLED: Weather = { days: sampleWeather.days, source: 'bundled', provenance: 'simulated' }
const DEFAULT_SCHEDULE: FixedSchedule = { mmPerEvent: 15, eventsPerWeek: 3 }
const KEY = 'geoviva:v1'

interface Persisted {
  zones: Zone[]
  readings: Reading[]
  overrides: Record<string, ScenarioOverrides>
  schedule: FixedSchedule
  weatherMode: WeatherMode
  presentation: boolean
}

const DEFAULTS: Persisted = {
  zones: SAMPLE_FARM.zones,
  readings: SAMPLE_READINGS,
  overrides: {},
  schedule: DEFAULT_SCHEDULE,
  weatherMode: 'sample',
  presentation: false,
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

function useFarmState() {
  const [state, setState] = useState<Persisted>(load)
  const [selectedZoneId, setSelectedZoneId] = useState(state.zones[0].id)
  const [liveWeather, setLiveWeather] = useState<Weather | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      /* storage unavailable: state still works in memory */
    }
  }, [state])

  useEffect(() => {
    if (state.weatherMode === 'live' && !liveWeather) getWeather(SAMPLE_FARM.lat, SAMPLE_FARM.lon).then(setLiveWeather)
  }, [state.weatherMode, liveWeather])

  // A cached forecast can start in the past; the engine treats days[0] as today.
  const weather = useMemo(() => {
    if (state.weatherMode !== 'live' || !liveWeather) return BUNDLED
    const today = new Date().toLocaleDateString('en-CA')
    const days = liveWeather.days.filter((d) => d.date >= today)
    return days.length >= 2 ? { ...liveWeather, days } : BUNDLED
  }, [state.weatherMode, liveWeather])

  const latest = useCallback(
    (zoneId: string) =>
      state.readings.filter((r) => r.zoneId === zoneId).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0] ??
      SAMPLE_READINGS.find((r) => r.zoneId === zoneId)!,
    [state.readings],
  )

  const recommendations = useMemo(() => {
    const out: Record<string, Recommendation> = {}
    for (const z of state.zones) out[z.id] = recommend(z, latest(z.id), weather.days, state.overrides[z.id])
    return out
  }, [state.zones, state.overrides, weather, latest])

  const comparisons = useMemo(() => {
    const out: Record<string, WaterComparison> = {}
    // Strategy comparison: both runs start from the same well-watered soil (midway between
    // refill point and field capacity), so GeoViva isn't charged for fixing today's deficit.
    for (const z of state.zones) {
      const start = (recommendations[z.id].refillMoisture + SOILS[z.soilId].fieldCapacity) / 2
      out[z.id] = simulateWater(z, start, weather.days, state.schedule)
    }
    return out
  }, [state.zones, state.schedule, weather, recommendations])

  const patch = (p: Partial<Persisted>) => setState((s) => ({ ...s, ...p }))

  return {
    farm: SAMPLE_FARM,
    zones: state.zones,
    weather,
    weatherMode: state.weatherMode,
    weatherLabel: weather.source === 'bundled' ? sampleWeather.label : `Live forecast (${weather.source})`,
    selectedZoneId,
    selectZone: setSelectedZoneId,
    latestReading: latest,
    overrides: state.overrides,
    recommendations,
    comparisons,
    schedule: state.schedule,
    presentation: state.presentation,
    setOverride: (zoneId: string, o: ScenarioOverrides) =>
      setState((s) => ({ ...s, overrides: { ...s.overrides, [zoneId]: { ...s.overrides[zoneId], ...o } } })),
    applyPresetToAll: (o: ScenarioOverrides) =>
      setState((s) => ({ ...s, overrides: Object.fromEntries(s.zones.map((z) => [z.id, { ...s.overrides[z.id], ...o }])) })),
    clearOverrides: () => patch({ overrides: {} }),
    updateZone: (id: string, z: Partial<Zone>) =>
      setState((s) => ({ ...s, zones: s.zones.map((x) => (x.id === id ? { ...x, ...z } : x)) })),
    setSchedule: (schedule: FixedSchedule) => patch({ schedule }),
    setWeatherMode: (weatherMode: WeatherMode) => patch({ weatherMode }),
    // Imported measurements replace simulated readings, whatever their dates.
    importReadings: (readings: Reading[]) =>
      setState((s) => ({ ...s, readings: [...s.readings.filter((r) => r.provenance !== 'simulated'), ...readings] })),
    setPresentation: (presentation: boolean) => patch({ presentation }),
    resetDemo: () => {
      setState({ ...DEFAULTS, presentation: state.presentation })
      setSelectedZoneId(DEFAULTS.zones[0].id)
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
