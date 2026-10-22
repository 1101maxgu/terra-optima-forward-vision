// Pure helpers for the zone detail page.
import type { CropId, IrrigationEvent, SensorReading } from '../../types'

export const CROP_EMOJI: Record<CropId, string> = { tomato: '🍅', lettuce: '🥬', blueberry: '🫐', strawberry: '🍓' }

/** Plain-language soil descriptions for farmers. */
export const SOIL_TEXT: Record<string, string> = {
  'sandy-loam': 'Drains quickly and holds less water, so it needs smaller, more frequent waterings.',
  loam: 'Balanced soil: drains well and holds a good amount of water.',
  'silt-loam': 'Holds a lot of water and drains slowly, so waterings can be less frequent.',
}

export const SOIL_DRAINAGE: Record<string, string> = { 'sandy-loam': 'Fast drainage', loam: 'Good drainage', 'silt-loam': 'Slow drainage' }

// 1 mm of water over 1 m² is 1 L.
export const mmToLitres = (mm: number, areaM2: number) => Math.round(mm * areaM2)
export const litresToMm = (litres: number, areaM2: number) => (areaM2 > 0 ? Math.round((litres / areaM2) * 10) / 10 : 0)

const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA') // local YYYY-MM-DD

export interface DaySummary {
  date: string
  count: number
  avgPct: number
  minPct: number
  maxPct: number
}

/** One row per local day with readings, newest first. */
export function dailySummary(readings: SensorReading[]): DaySummary[] {
  const by = new Map<string, number[]>()
  for (const r of readings) {
    if (!Number.isFinite(r.soilMoisturePercent)) continue
    const k = dayKey(r.timestamp)
    by.set(k, [...(by.get(k) ?? []), r.soilMoisturePercent])
  }
  return [...by.entries()]
    .map(([date, v]) => ({
      date,
      count: v.length,
      avgPct: Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10,
      minPct: Math.min(...v),
      maxPct: Math.max(...v),
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

export type HistoryItem = { kind: 'readings'; date: string; day: DaySummary } | { kind: 'irrigation'; date: string; event: IrrigationEvent }

/** Daily reading summaries and irrigation events merged, newest first (an event sorts above that day's summary). */
export function historyTimeline(readings: SensorReading[], events: IrrigationEvent[]): HistoryItem[] {
  const items: (HistoryItem & { t: string })[] = [
    ...dailySummary(readings).map((day) => ({ kind: 'readings' as const, date: day.date, day, t: `${day.date}T00` })),
    ...events.map((event) => ({ kind: 'irrigation' as const, date: dayKey(event.timestamp), event, t: `${dayKey(event.timestamp)}T1${event.timestamp}` })),
  ]
  return items.sort((a, b) => b.t.localeCompare(a.t)).map(({ t: _t, ...i }) => i as HistoryItem)
}

/** Series label for a reading: its sensor, or the manual/CSV source. */
export const seriesKey = (r: SensorReading) => r.sensorId ?? (r.source === 'csv' ? 'csv' : 'manual')

/** Wide rows for Recharts: one row per timestamp, one numeric column per series. */
export function chartRows(readings: SensorReading[], sinceMs: number): { rows: Record<string, number>[]; keys: string[] } {
  const keys = new Set<string>()
  const byT = new Map<number, Record<string, number>>()
  for (const r of readings) {
    const t = Date.parse(r.timestamp)
    if (!(t >= sinceMs) || !Number.isFinite(r.soilMoisturePercent)) continue
    const k = seriesKey(r)
    keys.add(k)
    const row = byT.get(t) ?? { t }
    row[k] = r.soilMoisturePercent
    byT.set(t, row)
  }
  return { rows: [...byT.values()].sort((a, b) => a.t - b.t), keys: [...keys] }
}
