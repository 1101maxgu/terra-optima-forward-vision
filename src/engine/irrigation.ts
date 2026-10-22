// STUB — Agent A replaces the bodies. Signatures are frozen.
import type { FixedSchedule, Reading, Recommendation, ScenarioOverrides, WaterComparison, WeatherDay, Zone } from '../types'

/** Recommend irrigation for one zone over a 48 h horizon (forecast[0] = today). */
export function recommend(
  zone: Zone,
  reading: Reading,
  forecast: WeatherDay[],
  overrides: ScenarioOverrides = {},
): Recommendation {
  const moisture = overrides.moisture ?? reading.moisture
  const dry = moisture < 0.2
  void forecast
  return {
    zoneId: zone.id,
    status: dry ? 'irrigate-now' : 'ok',
    netMm: dry ? 20 : 0,
    grossMm: dry ? 22 : 0,
    litres: dry ? 22 * zone.areaM2 : 0,
    timing: dry ? 'Tonight, 8–10 pm' : 'No watering needed',
    tawMm: 60,
    rawMm: 30,
    depletionMm: dry ? 35 : 10,
    projectedDepletionMm: dry ? 45 : 18,
    refillMoisture: 0.2,
    factors: [{ label: 'Soil moisture', value: `${Math.round(moisture * 100)}%`, effect: dry ? 'raises' : 'lowers', provenance: reading.provenance }],
    summary: 'Stub recommendation.',
  }
}

/** Day-by-day modelled comparison: fixed schedule vs following recommend(). */
export function simulateWater(
  zone: Zone,
  startMoisture: number,
  weather: WeatherDay[],
  schedule: FixedSchedule,
): WaterComparison {
  void startMoisture
  const baseline = schedule.mmPerEvent * schedule.eventsPerWeek * 2 * zone.areaM2
  const geoviva = baseline * 0.7
  return {
    zoneId: zone.id,
    baselineLitres: baseline,
    geovivaLitres: geoviva,
    avoidedLitres: baseline - geoviva,
    reductionPct: 30,
    daily: weather.slice(0, 14).map((d) => ({ date: d.date, baselineLitres: baseline / 14, geovivaLitres: geoviva / 14, moisture: 0.25 })),
    provenance: 'projected',
  }
}
