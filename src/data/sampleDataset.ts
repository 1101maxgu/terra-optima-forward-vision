// SAMPLE farm for demos — fictional farm, illustrative boundaries on generic Fraser Valley
// farmland, simulated sensors. Never mixed with the farmer's own dataset (see repo.ts).
import type { FarmData, GeoPolygon, IrrigationEvent, Sensor, SensorReading, Zone } from '../types'
import { SAMPLE_FARM, SAMPLE_READINGS } from './sampleFarm'
import { polygonAreaM2 } from '../map/geo'

export const SAMPLE_FARM_ID = 'sample-farm'

// Rectangles laid out in metres from a south-west origin, converted to lon/lat.
// Open field north of Hwy 1 (checked against satellite imagery so boundaries don't cross roads or buildings).
const LON0 = -122.2183
const LAT0 = 49.0435
const M_PER_DEG_LAT = 111_200
const M_PER_DEG_LON = 111_320 * Math.cos((LAT0 * Math.PI) / 180)
function rect(x0: number, y0: number, x1: number, y1: number): GeoPolygon {
  const p = (x: number, y: number): [number, number] => [
    +(LON0 + x / M_PER_DEG_LON).toFixed(7),
    +(LAT0 + y / M_PER_DEG_LAT).toFixed(7),
  ]
  return { type: 'Polygon', coordinates: [[p(x0, y0), p(x1, y0), p(x1, y1), p(x0, y1), p(x0, y0)]] }
}

const BOUNDARIES: Record<string, GeoPolygon> = {
  a: rect(0, 48, 50, 88), // ~2,000 m²
  b: rect(58, 48, 93, 88), // ~1,400 m²
  c: rect(0, 0, 80, 40), // ~3,200 m²
  d: rect(88, 0, 138, 40), // ~2,000 m²
}

const H = 3600_000

/** Builds the sample farm with timestamps relative to `now`, so it always looks current. */
export function buildSampleData(now = Date.now()): FarmData {
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString()
  const created = iso(30 * 24 * H)

  const zones: Zone[] = ([
    ...SAMPLE_FARM.zones,
    { id: 'd',name: 'Zone D · Strawberries', cropId: 'strawberry', soilId: 'loam', method: 'drip', areaM2: 2000 },
  ] as Zone[]).map((z) => ({ ...z, farmId: SAMPLE_FARM_ID, boundary: BOUNDARIES[z.id], areaM2: Math.round(polygonAreaM2(BOUNDARIES[z.id])), createdAt: created, updatedAt: created }))

  const sensor = (id: string, name: string, type: Sensor['type'], zoneId: string | null, depthCm: number, battery: number, lastSeenAgo: number, at?: [number, number]): Sensor => ({
    id, farmId: SAMPLE_FARM_ID, name, deviceId: `sample-${id}`, type, provider: type === 'lorawan' ? 'ttn' : undefined,
    depthCm, zoneId, batteryPercent: battery, lastSeen: iso(lastSeenAgo), createdAt: created,
    ...(at ? { lon: at[0], lat: at[1] } : {}),
  })
  const inside = (z: string, fx: number, fy: number): [number, number] => {
    const r = BOUNDARIES[z].coordinates[0]
    return [r[0][0] + (r[1][0] - r[0][0]) * fx, r[0][1] + (r[2][1] - r[0][1]) * fy]
  }
  const sensors: Sensor[] = [
    sensor('s1', 'TTN-001', 'lorawan', 'a', 20, 88, 0.15 * H, inside('a', 0.3, 0.5)),
    sensor('s2', 'TTN-002', 'lorawan', 'a', 40, 81, 0.5 * H, inside('a', 0.7, 0.5)),
    sensor('s3', 'TTN-003', 'lorawan', 'b', 15, 15, 1 * H, inside('b', 0.5, 0.5)),
    sensor('s4', 'TTN-004', 'lorawan', 'c', 30, 74, 0.2 * H, inside('c', 0.5, 0.5)),
    sensor('s5', 'ESP32-001', 'esp32', 'd', 15, 0, 30 * H, inside('d', 0.4, 0.5)), // offline: shows "Check sensor"
    sensor('s6', 'ESP32-002', 'esp32', null, 15, 96, 0.4 * H), // unassigned
  ]

  // 7 days of readings every 6 h, drying toward the current value (current = SAMPLE_READINGS, D = 0.24).
  const current: Record<string, number> = { ...Object.fromEntries(SAMPLE_READINGS.map((r) => [r.zoneId, r.moisture])), d: 0.24 }
  const temps: Record<string, number> = { a: 14, b: 13, c: 12, d: 13 }
  const readings: SensorReading[] = []
  for (const s of sensors) {
    if (!s.zoneId) continue
    const last = Date.parse(s.lastSeen!)
    for (let i = 27; i >= 0; i--) {
      const t = last - i * 6 * H
      // Demo faults for sensor trust: s2 is stuck at its 24 h-old value; s4 had a one-off spike 12 h ago.
      const vwc = current[s.zoneId] + 0.002 * (s.id === 's2' ? Math.max(i, 4) : i) + (s.depthCm >= 40 ? 0.01 : 0) + (s.id === 's4' && i === 2 ? 0.2 : 0)
      readings.push({
        id: `${s.id}-${i}`, sensorId: s.id, zoneId: s.zoneId, timestamp: new Date(t).toISOString(),
        soilMoisturePercent: Math.round(vwc * 1000) / 10, soilTemperatureC: temps[s.zoneId] + (i % 4 === 2 ? 3 : 0),
        depthCm: s.depthCm, batteryPercent: s.batteryPercent, source: 'sample',
      })
    }
  }

  const events: IrrigationEvent[] = [
    { id: 'e1', zoneId: 'a', timestamp: iso(4 * 24 * H), mm: 15, litres: 30_000, source: 'sample' },
    { id: 'e2', zoneId: 'b', timestamp: iso(2 * 24 * H), mm: 10, litres: 14_000, source: 'sample' },
    { id: 'e3', zoneId: 'c', timestamp: iso(5 * 24 * H), mm: 18, litres: 57_600, source: 'sample' },
    { id: 'e4', zoneId: 'd', timestamp: iso(3 * 24 * H), mm: 8, litres: 16_000, source: 'sample' },
  ]

  return {
    farm: { id: SAMPLE_FARM_ID, name: 'Riverbend Market Garden (sample farm)', location: 'Abbotsford, BC (Fraser Valley)', lat: LAT0 + 0.0004, lon: LON0 + 0.0009 },
    zones, sensors, readings, events,
  }
}
