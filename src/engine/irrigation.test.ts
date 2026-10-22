import { describe, expect, it } from 'vitest'
import type { Reading, WeatherDay, Zone } from '../types'
import { EFFICIENCY, recommend, simulateWater, splitSessions } from './irrigation'

// Loam: FC 0.30, WP 0.13. Tomato: Kc 1.15, root 700 mm, p 0.40.
// TAW = 0.17 × 700 = 119 mm, RAW = 0.40 × 119 = 47.6 mm, refill θ = 0.30 − 47.6/700 = 0.232.
const tomato: Zone = { id: 'a', name: 'Zone A', cropId: 'tomato', soilId: 'loam', method: 'drip', areaM2: 400 }
const reading = (moisture: number): Reading => ({ zoneId: 'a', timestamp: '2026-07-14T07:00:00-07:00', moisture, soilTempC: 15, provenance: 'measured' })
const days = (n: number, et0Mm: number, rainMm: number): WeatherDay[] =>
  Array.from({ length: n }, (_, i) => ({ date: `2026-07-${String(14 + i).padStart(2, '0')}`, tMaxC: 28, tMinC: 14, rainMm, et0Mm }))

describe('recommend', () => {
  it('dry soil + no rain -> irrigate-now, refill to field capacity', () => {
    // Dr = (0.30 − 0.19) × 700 = 77 mm ≥ RAW 47.6. ΣETc = 1.15 × 5 × 2 = 11.5 -> Dfuture 88.5.
    // net 77.0 mm, gross 77 / 0.90 = 85.56 -> 85.6 mm, litres 85.56 × 400 = 34,222 -> 34,220 L.
    const r = recommend(tomato, reading(0.19), days(2, 5, 0))
    expect(r.status).toBe('irrigate-now')
    expect(r.tawMm).toBe(119)
    expect(r.rawMm).toBe(47.6)
    expect(r.depletionMm).toBe(77)
    expect(r.projectedDepletionMm).toBe(88.5)
    expect(r.netMm).toBe(77)
    expect(r.grossMm).toBe(85.6)
    expect(r.litres).toBe(34220)
    expect(r.refillMoisture).toBeCloseTo(0.232, 3)
    expect(r.factors[0].provenance).toBe('measured')
    expect(r.summary).toContain('34,220 L')
  })

  it('drying soil + 15 mm rain over 48 h -> skip-rain', () => {
    // Dr = 0.06 × 700 = 42 < RAW. Without rain 42 + 11.5 = 53.5 ≥ 47.6 (would be irrigate-soon).
    // Rain 7.5 mm/day -> effective 6 mm/day = 12 mm -> Dfuture 41.5 < 47.6.
    const r = recommend(tomato, reading(0.24), days(2, 5, 7.5))
    expect(r.status).toBe('skip-rain')
    expect(r.netMm).toBe(0)
    expect(r.litres).toBe(0)
    expect(r.timing).toBe('Skip — about 15 mm of rain expected')
    // Same result via the 48 h rain override (eff(15) = 12 mm).
    expect(recommend(tomato, reading(0.24), days(2, 5, 0), { rainNext48hMm: 15 }).status).toBe('skip-rain')
  })

  it('saturated soil -> ok, net 0', () => {
    const r = recommend(tomato, reading(0.4), days(2, 5, 0))
    expect(r.status).toBe('ok')
    expect(r.depletionMm).toBe(0)
    expect(r.netMm).toBe(0)
    expect(r.litres).toBe(0)
  })

  it('sprinkler needs 0.90/0.75 = 1.2× the water of drip', () => {
    const drip = recommend(tomato, reading(0.19), days(2, 5, 0))
    const spr = recommend({ ...tomato, method: 'sprinkler' }, reading(0.19), days(2, 5, 0))
    expect(spr.netMm).toBe(drip.netMm)
    expect(spr.litres).toBeGreaterThan(drip.litres)
    expect(spr.litres / drip.litres).toBeCloseTo(EFFICIENCY.drip / EFFICIENCY.sprinkler, 2)
  })

  it('different crops at the same moisture get different thresholds and status', () => {
    // θ 0.24 on loam, ET0 5 mm/day:
    // tomato: Dr 42, RAW 47.6, 42 + 11.5 ≥ 47.6 -> soon
    // lettuce (300 mm, p 0.30): TAW 51, RAW 15.3, Dr 18 ≥ RAW -> now
    // blueberry (600 mm, p 0.50): TAW 102, RAW 51, Dr 36 + 10.5 < 51 -> ok
    const w = days(2, 5, 0)
    const t = recommend(tomato, reading(0.24), w)
    const l = recommend({ ...tomato, cropId: 'lettuce' }, reading(0.24), w)
    const b = recommend({ ...tomato, cropId: 'blueberry' }, reading(0.24), w)
    expect([t.status, l.status, b.status]).toEqual(['irrigate-soon', 'irrigate-now', 'ok'])
    expect(new Set([t.rawMm, l.rawMm, b.rawMm]).size).toBe(3)
  })

  it('missing/short forecast and NaN ET0 fall back to the default, no NaN anywhere', () => {
    // Default ET0 4.5 -> ΣETc = 1.15 × 4.5 × 2 = 10.35; Dr 77 -> Dfuture 87.35 (float rounding may give 87.3).
    for (const f of [[], days(1, NaN, 0), [{ ...days(1, 5, 0)[0], et0Mm: undefined as unknown as number }]]) {
      const r = recommend(tomato, reading(0.19), f)
      const json = JSON.stringify(r)
      expect(json).not.toMatch(/NaN|null|undefined/)
      expect(Number.isFinite(r.projectedDepletionMm)).toBe(true)
    }
    expect(recommend(tomato, reading(0.19), []).projectedDepletionMm).toBeCloseTo(87.35, 0)
    expect(recommend(tomato, reading(0.19), [], { et0Mm: NaN }).projectedDepletionMm).toBeCloseTo(87.35, 0)
  })

  it('moisture override marks the soil factor as simulated', () => {
    const r = recommend(tomato, reading(0.19), days(2, 5, 0), { moisture: 0.4 })
    expect(r.status).toBe('ok')
    expect(r.factors[0].provenance).toBe('simulated')
  })
})

describe('simulateWater', () => {
  const schedule = { mmPerEvent: 15, eventsPerWeek: 3 }

  it('totals equal the sum of daily rows; baseline uses days 0,2,4,7,9,11', () => {
    const c = simulateWater(tomato, 0.2, days(14, 5.5, 0), schedule)
    expect(c.daily).toHaveLength(14)
    expect(c.baselineLitres).toBe(c.daily.reduce((s, d) => s + d.baselineLitres, 0))
    expect(c.geovivaLitres).toBe(c.daily.reduce((s, d) => s + d.geovivaLitres, 0))
    expect(c.avoidedLitres).toBe(c.baselineLitres - c.geovivaLitres)
    expect(c.daily.filter((d) => d.baselineLitres > 0).map((d) => d.date.slice(-2))).toEqual(['14', '16', '18', '21', '23', '25'])
    expect(c.baselineLitres).toBe(6 * 15 * 400)
    expect(c.provenance).toBe('projected')
  })

  it('wet fortnight: GeoViva uses less water than the fixed schedule', () => {
    const c = simulateWater(tomato, 0.28, days(14, 3, 10), schedule)
    expect(c.geovivaLitres).toBeLessThan(c.baselineLitres)
    expect(c.reductionPct).toBeGreaterThan(0)
  })

  it('reductionPct is finite when the baseline is zero', () => {
    const c = simulateWater(tomato, 0.15, days(14, 6, 0), { mmPerEvent: 15, eventsPerWeek: 0 })
    expect(c.baselineLitres).toBe(0)
    expect(c.geovivaLitres).toBeGreaterThan(0)
    expect(Number.isFinite(c.reductionPct)).toBe(true)
    expect(c.daily.every((d) => Number.isFinite(d.moisture))).toBe(true)
  })
})

it('splitSessions caps each session at 20 mm', () => {
  expect(splitSessions(86, 2000)).toEqual({ sessions: 5, mmEach: 17.2, litresEach: 34400 })
  expect(splitSessions(12, 100).sessions).toBe(1)
})
