// FAO-56 root-zone water balance. Pure and deterministic. Constants: src/data, docs/sources.md.
import { CROPS } from '../data/crops'
import { SOILS } from '../data/soils'
import type {
  Factor,
  FixedSchedule,
  IrrigationMethod,
  Reading,
  Recommendation,
  RecStatus,
  ScenarioOverrides,
  WaterComparison,
  WeatherDay,
  Zone,
} from '../types'

/** Application efficiency by method (water reaching the root zone / water pumped). */
export const EFFICIENCY: Record<IrrigationMethod, number> = { drip: 0.9, sprinkler: 0.75 }

/** ET0 used when the forecast is short or a day's ET0 is missing/NaN (typical Fraser Valley summer day, mm/day). */
export const DEFAULT_ET0_MM = 4.5

const HORIZON_DAYS = 2

/** Largest single irrigation event we suggest (mm); bigger totals are split to limit runoff and deep drainage. */
export const MAX_SESSION_MM = 20

/** Split a gross application depth into evenly sized sessions. */
export function splitSessions(grossMm: number, areaM2: number) {
  const sessions = Math.max(1, Math.ceil(grossMm / MAX_SESSION_MM))
  return { sessions, mmEach: Math.round((grossMm / sessions) * 10) / 10, litresEach: r10((grossMm / sessions) * areaM2) }
}

/** Effective rainfall: light showers (< 3 mm) mostly evaporate; otherwise ~80% reaches the root zone. */
export const effectiveRain = (r: number): number => (r < 3 ? 0 : 0.8 * r)

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
const r1 = (x: number) => Math.round(x * 10) / 10
const r10 = (x: number) => Math.round(x / 10) * 10
const pct = (theta: number) => `${Math.round(theta * 100)}%`
const fmtL = (l: number) => l.toLocaleString('en-US')
const finite = (x: number | undefined): x is number => typeof x === 'number' && Number.isFinite(x)

/** Recommend irrigation for one zone over a 48 h horizon (forecast[0] = today). */
export function recommend(
  zone: Zone,
  reading: Reading,
  forecast: WeatherDay[],
  overrides: ScenarioOverrides = {},
): Recommendation {
  const crop = CROPS[zone.cropId]
  const soil = SOILS[zone.soilId]
  const eff = zone.efficiency ?? EFFICIENCY[zone.method]
  const zr = zone.rootDepthMm ?? crop.rootDepthMm
  const theta = overrides.moisture ?? reading.moisture

  const taw = (soil.fieldCapacity - soil.wiltingPoint) * zr
  const raw = crop.p * taw
  const dr = clamp((soil.fieldCapacity - theta) * zr, 0, taw)

  // 48 h horizon; missing days or bad ET0 fall back to DEFAULT_ET0_MM, missing rain to 0.
  let etc = 0
  let rainRaw = 0
  let rainEff = 0
  for (let i = 0; i < HORIZON_DAYS; i++) {
    const day = forecast[i]
    const et0 = finite(overrides.et0Mm) ? overrides.et0Mm : finite(day?.et0Mm) ? day.et0Mm : DEFAULT_ET0_MM
    etc += crop.kc * et0
    const rain = finite(day?.rainMm) ? Math.max(0, day.rainMm) : 0
    rainRaw += rain
    rainEff += effectiveRain(rain)
  }
  if (finite(overrides.rainNext48hMm)) {
    rainRaw = Math.max(0, overrides.rainNext48hMm)
    rainEff = effectiveRain(rainRaw)
  }

  const dFuture = clamp(dr + etc - rainEff, 0, taw)

  let status: RecStatus
  if (dFuture >= raw) status = dr >= raw ? 'irrigate-now' : 'irrigate-soon'
  else if (dr + etc >= raw) status = 'skip-rain'
  else status = 'ok'

  const net = status === 'irrigate-now' ? dr : status === 'irrigate-soon' ? dFuture : 0
  const gross = net / eff
  const litres = r10(gross * zone.areaM2) // 1 mm over 1 m² = 1 L
  const refill = soil.fieldCapacity - raw / zr
  const rainR = Math.round(rainRaw)

  const timing = {
    'irrigate-now': 'Today — early morning or evening (less evaporation)',
    'irrigate-soon': 'Within 24–48 h — recheck tomorrow',
    'skip-rain': `Skip — about ${rainR} mm of rain expected`,
    ok: 'No watering needed',
  }[status]

  const factors: Factor[] = [
    {
      label: 'Soil moisture vs refill point',
      value: `${pct(theta)} (refill point ${pct(refill)})`,
      effect: theta < refill ? 'raises' : 'lowers',
      provenance: overrides.moisture !== undefined ? 'simulated' : reading.provenance,
    },
    {
      label: 'Crop water use next 48 h',
      value: `${r1(etc)} mm (Kc ${crop.kc} × ET₀)`,
      effect: 'raises',
      provenance: 'estimated',
    },
    {
      label: 'Forecast rain (effective)',
      value: `${r1(rainEff)} mm useful of ${r1(rainRaw)} mm forecast`,
      effect: rainEff > 0 ? 'lowers' : 'neutral',
      provenance: 'estimated',
    },
    {
      label: 'Soil water-holding',
      value: `${Math.round(taw)} mm available, refill after ${Math.round(raw)} mm used (${soil.name.toLowerCase()}, ${zr} mm roots)`,
      effect: 'neutral',
      provenance: 'estimated',
    },
    {
      label: 'Irrigation method efficiency',
      value: `${zone.method} ${Math.round(eff * 100)}%`,
      effect: zone.method === 'sprinkler' ? 'raises' : 'neutral',
      provenance: 'estimated',
    },
  ]

  const who = `${zone.name} (${crop.name.toLowerCase()}) is at ${pct(theta)} moisture`
  const rainClause = rainEff > 0 ? `only about ${rainR} mm of rain is forecast` : 'no meaningful rain is forecast'
  const summary = {
    'irrigate-now': `${who}, below the ${pct(refill)} refill point, and ${rainClause} — apply about ${fmtL(litres)} L.`,
    'irrigate-soon': `${who}, above the ${pct(refill)} refill point, but crop water use over the next 48 h will push it past — plan about ${fmtL(litres)} L within 24–48 h.`,
    'skip-rain': `${who}; about ${rainR} mm of rain forecast in the next 48 h should cover crop water use — skip watering and recheck after the rain.`,
    ok: `${who}, comfortably above the ${pct(refill)} refill point — no watering needed for the next 48 h.`,
  }[status]

  return {
    zoneId: zone.id,
    status,
    netMm: r1(net),
    grossMm: r1(gross),
    litres,
    timing,
    tawMm: r1(taw),
    rawMm: r1(raw),
    depletionMm: r1(dr),
    projectedDepletionMm: r1(dFuture),
    refillMoisture: Math.round(refill * 1000) / 1000,
    factors,
    summary,
  }
}

/** Day-by-day modelled comparison: fixed schedule vs following recommend(). */
export function simulateWater(
  zone: Zone,
  startMoisture: number,
  weather: WeatherDay[],
  schedule: FixedSchedule,
): WaterComparison {
  const crop = CROPS[zone.cropId]
  const soil = SOILS[zone.soilId]
  const eff = zone.efficiency ?? EFFICIENCY[zone.method]
  const zr = zone.rootDepthMm ?? crop.rootDepthMm
  const taw = (soil.fieldCapacity - soil.wiltingPoint) * zr
  const days = weather.slice(0, 14)

  // Evenly spaced events within each week, e.g. 3/week -> days 0, 2, 4.
  const perWeek = clamp(Math.round(schedule.eventsPerWeek), 0, 7)
  const eventDays = new Set(Array.from({ length: perWeek }, (_, i) => Math.floor((i * 7) / perWeek)))

  const step = (d: number, day: WeatherDay, grossMm: number) => {
    const et0 = finite(day.et0Mm) ? day.et0Mm : DEFAULT_ET0_MM
    const rain = finite(day.rainMm) ? day.rainMm : 0
    // Water beyond field capacity drains away (clamp at 0), but still counts as applied.
    return clamp(d + crop.kc * et0 - effectiveRain(rain) - grossMm * eff, 0, taw)
  }

  let dBase = clamp((soil.fieldCapacity - startMoisture) * zr, 0, taw)
  let dGeo = dBase
  const daily: WaterComparison['daily'] = days.map((day, i) => {
    const baseMm = eventDays.has(i % 7) ? schedule.mmPerEvent : 0
    const baselineLitres = baseMm * zone.areaM2
    dBase = step(dBase, day, baseMm)

    const reading: Reading = {
      zoneId: zone.id,
      timestamp: day.date,
      moisture: soil.fieldCapacity - dGeo / zr,
      soilTempC: NaN,
      provenance: 'projected',
    }
    const rec = recommend(zone, reading, days.slice(i, i + 2))
    const geoMm = rec.status === 'irrigate-now' ? rec.grossMm : 0
    const geovivaLitres = rec.status === 'irrigate-now' ? rec.litres : 0
    dGeo = step(dGeo, day, geoMm)

    return { date: day.date, baselineLitres, geovivaLitres, moisture: Math.round((soil.fieldCapacity - dGeo / zr) * 1000) / 1000 }
  })

  const baselineLitres = daily.reduce((s, r) => s + r.baselineLitres, 0)
  const geovivaLitres = daily.reduce((s, r) => s + r.geovivaLitres, 0)
  const avoidedLitres = baselineLitres - geovivaLitres
  return {
    zoneId: zone.id,
    baselineLitres,
    geovivaLitres,
    avoidedLitres,
    reductionPct: baselineLitres > 0 ? r1((avoidedLitres / baselineLitres) * 100) : 0,
    daily,
    provenance: 'projected',
  }
}
