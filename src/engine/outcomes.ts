// Measurable outcomes: water, irrigation events, labour and cost, compared with a baseline. Pure; no React.
// Two baselines: a fixed calendar schedule (modelled) and the farmer's own previous period (logged).
// Every result is an estimate; see docs/outcomes.md for what each number does and does not mean.
import type { FixedSchedule, IrrigationEvent, Zone, WeatherDay } from '../types'
import { simulateWater } from './irrigation'

export interface CostAssumptions {
  waterPerM3: number // $ per m³ of water
  kWhPerM3: number // pumping energy
  electricityPerKWh: number // $
  minutesPerEvent: number // labour to start, check and stop one watering
  wagePerH: number // $
}

export const DEFAULT_SCHEDULE: FixedSchedule = { mmPerEvent: 15, eventsPerWeek: 3 }

export const DEFAULT_COSTS: CostAssumptions = {
  waterPerM3: 0.21,
  kWhPerM3: 0.12,
  electricityPerKWh: 0.135,
  minutesPerEvent: 10,
  wagePerH: 20,
}

/** Where each default comes from. `placeholder` means we could not source it: the farmer should replace it. */
export const COST_META: Record<keyof CostAssumptions, { label: string; unit: string; placeholder: boolean; note: string }> = {
  waterPerM3: {
    label: 'Water price', unit: '$/m³', placeholder: true,
    note: 'Placeholder: CRD agricultural rate 2026 (Vancouver Island). No current Fraser Valley rate found. A licensed well or surface source costs close to $0; use your bill.',
  },
  kWhPerM3: {
    label: 'Pumping energy', unit: 'kWh/m³', placeholder: true,
    note: 'Placeholder: calculated for drip at ~20 m head and 50% pump efficiency (range 0.05–0.30). Not a BC figure.',
  },
  electricityPerKWh: {
    label: 'Electricity', unit: '$/kWh', placeholder: false,
    note: 'BC Hydro Small General Service energy rate (13.52 ¢/kWh), from the BC Hydro business rates page (undated, found Oct 2026). Excludes the daily basic charge.',
  },
  minutesPerEvent: {
    label: 'Labour per watering', unit: 'min', placeholder: true,
    note: 'Placeholder: assumed 10 min to start, check and stop one watering. No published figure found.',
  },
  wagePerH: {
    label: 'Labour wage', unit: '$/h', placeholder: false,
    note: 'Job Bank BC median for farm hands, Nov 2025 ($20.00). BC minimum wage is $18.25 from June 2026.',
  },
}

export interface Outcome {
  litres: number
  events: number
  labourH: number
  cost: { water: number; energy: number; labour: number; total: number }
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function outcomeOf(litres: number, events: number, a: CostAssumptions): Outcome {
  const m3 = litres / 1000
  const labourH = (events * a.minutesPerEvent) / 60
  const water = m3 * a.waterPerM3
  const energy = m3 * a.kWhPerM3 * a.electricityPerKWh
  const labour = labourH * a.wagePerH
  return { litres, events, labourH: r2(labourH), cost: { water: r2(water), energy: r2(energy), labour: r2(labour), total: r2(water + energy + labour) } }
}

/** Baseline minus GeoViva; positive means GeoViva uses less. */
export function difference(base: Outcome, geo: Outcome): Outcome {
  const d = (x: number, y: number) => r2(x - y)
  return {
    litres: base.litres - geo.litres, events: base.events - geo.events, labourH: d(base.labourH, geo.labourH),
    cost: { water: d(base.cost.water, geo.cost.water), energy: d(base.cost.energy, geo.cost.energy), labour: d(base.cost.labour, geo.cost.labour), total: d(base.cost.total, geo.cost.total) },
  }
}

export const sumOutcomes = (os: Outcome[], a: CostAssumptions): Outcome =>
  outcomeOf(os.reduce((t, o) => t + o.litres, 0), os.reduce((t, o) => t + o.events, 0), a)

export interface ZoneProjection {
  zoneId: string
  days: number
  baseline: Outcome
  geoviva: Outcome
  baselineStressDays: number // days the fixed schedule would leave the crop below its refill point
}

/** Next 14 days for one zone: following recommendations vs the fixed schedule, from today's moisture. */
export function projectZone(zone: Zone, moisture: number, weather: WeatherDay[], schedule: FixedSchedule, a: CostAssumptions): ZoneProjection {
  const c = simulateWater(zone, moisture, weather, schedule)
  const n = (k: 'baselineLitres' | 'geovivaLitres') => c.daily.filter((d) => d[k] > 0).length
  return {
    zoneId: zone.id,
    days: c.daily.length,
    baseline: outcomeOf(c.baselineLitres, n('baselineLitres'), a),
    geoviva: outcomeOf(c.geovivaLitres, n('geovivaLitres'), a),
    baselineStressDays: c.baselineStressDays ?? 0,
  }
}

export interface HistoryComparison {
  current: Outcome
  previous: Outcome
  /** What the fixed schedule would have applied over the current period, for the same zones. */
  schedule: Outcome
  enough: boolean // previous period has at least MIN_PREVIOUS_EVENTS logged waterings
}

export const MIN_PREVIOUS_EVENTS = 2
const DAY = 86_400_000

/** Logged irrigation in the last `days` vs the `days` before that. Weather differences are not adjusted. */
export function compareHistory(events: IrrigationEvent[], zones: Zone[], days: number, now: number, schedule: FixedSchedule, a: CostAssumptions): HistoryComparison {
  const ids = new Set(zones.map((z) => z.id))
  const inRange = (from: number, to: number) => events.filter((e) => {
    const t = Date.parse(e.timestamp)
    return ids.has(e.zoneId) && t > from && t <= to
  })
  const cur = inRange(now - days * DAY, now)
  const prev = inRange(now - 2 * days * DAY, now - days * DAY)
  const total = (es: IrrigationEvent[]) => es.reduce((t, e) => t + e.litres, 0)
  const scheduledEvents = Math.round((schedule.eventsPerWeek * days) / 7) * zones.length
  const scheduledLitres = zones.reduce((t, z) => t + (schedule.mmPerEvent * z.areaM2 * Math.round((schedule.eventsPerWeek * days) / 7)), 0)
  return {
    current: outcomeOf(total(cur), cur.length, a),
    previous: outcomeOf(total(prev), prev.length, a),
    schedule: outcomeOf(scheduledLitres, scheduledEvents, a),
    enough: prev.length >= MIN_PREVIOUS_EVENTS,
  }
}
