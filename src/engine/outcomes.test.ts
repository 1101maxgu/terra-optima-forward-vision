import { describe, expect, it } from 'vitest'
import type { IrrigationEvent, WeatherDay, Zone } from '../types'
import { DEFAULT_COSTS, DEFAULT_SCHEDULE, compareHistory, difference, outcomeOf, projectZone } from './outcomes'
import { cleanOutcomeSettings } from '../state/farmStore'
import { buildSampleData } from '../data/sampleDataset'

const tomato: Zone = { id: 'z', name: 'Z', cropId: 'tomato', soilId: 'loam', method: 'drip', areaM2: 1000 }
const days = (n: number, et0: number, rain: number): WeatherDay[] =>
  Array.from({ length: n }, (_, i) => ({ date: `2026-07-${String(i + 1).padStart(2, '0')}`, tMaxC: 25, tMinC: 12, rainMm: rain, et0Mm: et0 }))
const DAY = 86_400_000
const NOW = Date.parse('2026-10-20T12:00:00Z')

describe('outcomeOf', () => {
  it('prices water, pumping and labour from the assumptions', () => {
    // 10 m³, 3 waterings at 10 min, $20/h: water 2.10, energy 10 × 0.12 × 0.135 = 0.162, labour 0.5 h × 20 = 10.
    const o = outcomeOf(10_000, 3, DEFAULT_COSTS)
    expect(o.labourH).toBe(0.5)
    expect(o.cost).toEqual({ water: 2.1, energy: 0.16, labour: 10, total: 12.26 })
  })

  it('difference is baseline minus GeoViva and can go negative', () => {
    const d = difference(outcomeOf(1000, 1, DEFAULT_COSTS), outcomeOf(3000, 2, DEFAULT_COSTS))
    expect(d.litres).toBe(-2000)
    expect(d.events).toBe(-1)
  })
})

describe('projectZone', () => {
  it('counts waterings on each side and saves water in a wet fortnight', () => {
    const p = projectZone(tomato, 0.28, days(14, 3, 10), DEFAULT_SCHEDULE, DEFAULT_COSTS)
    expect(p.days).toBe(14)
    expect(p.baseline.events).toBe(6) // 3 a week for 2 weeks
    expect(p.baseline.litres).toBe(6 * 15 * 1000)
    expect(p.geoviva.litres).toBeLessThan(p.baseline.litres)
    expect(p.geoviva.events).toBeLessThan(p.baseline.events)
  })
})

describe('compareHistory', () => {
  const ev = (daysAgo: number, litres = 1000): IrrigationEvent =>
    ({ id: `e${daysAgo}`, zoneId: 'z', timestamp: new Date(NOW - daysAgo * DAY).toISOString(), mm: litres / 1000, litres })

  it('splits logged waterings into this and the previous period', () => {
    const h = compareHistory([ev(1), ev(3), ev(8), ev(10), ev(12), ev(20)], [tomato], 7, NOW, DEFAULT_SCHEDULE, DEFAULT_COSTS)
    expect(h.current.events).toBe(2)
    expect(h.previous.events).toBe(3)
    expect(h.enough).toBe(true)
    expect(h.schedule.events).toBe(3)
    expect(h.schedule.litres).toBe(3 * 15 * 1000)
  })

  it('needs at least 2 waterings in the previous period', () => {
    expect(compareHistory([ev(1), ev(9)], [tomato], 7, NOW, DEFAULT_SCHEDULE, DEFAULT_COSTS).enough).toBe(false)
  })

  it('ignores zones that are not passed in', () => {
    const other = { ...ev(2), zoneId: 'gone' }
    expect(compareHistory([other], [tomato], 7, NOW, DEFAULT_SCHEDULE, DEFAULT_COSTS).current.events).toBe(0)
  })

  it('sample farm has history for both the 7- and 30-day views', () => {
    const now = Date.now()
    const d = buildSampleData(now)
    for (const n of [7, 30]) {
      const h = compareHistory(d.events, d.zones, n, now, DEFAULT_SCHEDULE, DEFAULT_COSTS)
      expect(h.enough).toBe(true)
      expect(h.current.litres).toBeLessThan(h.previous.litres)
    }
  })
})

describe('cleanOutcomeSettings', () => {
  it('keeps valid numbers and replaces junk with defaults', () => {
    const c = cleanOutcomeSettings({ schedule: { mmPerEvent: 20, eventsPerWeek: 9 }, costs: { waterPerM3: -1, wagePerH: 25, minutesPerEvent: 'x' } })
    expect(c.schedule).toEqual({ mmPerEvent: 20, eventsPerWeek: 7 })
    expect(c.costs.waterPerM3).toBe(DEFAULT_COSTS.waterPerM3)
    expect(c.costs.wagePerH).toBe(25)
    expect(c.costs.minutesPerEvent).toBe(DEFAULT_COSTS.minutesPerEvent)
    expect(cleanOutcomeSettings(undefined)).toEqual({ schedule: DEFAULT_SCHEDULE, costs: DEFAULT_COSTS })
  })
})

describe('baseline crop stress', () => {
  it('a dry zone on a light fixed schedule is flagged as stressed', () => {
    const p = projectZone(tomato, 0.2, days(14, 6, 0), { mmPerEvent: 5, eventsPerWeek: 1 }, DEFAULT_COSTS)
    expect(p.baselineStressDays).toBeGreaterThan(0)
  })
  it('a wet zone is not', () => {
    expect(projectZone(tomato, 0.29, days(14, 2, 10), DEFAULT_SCHEDULE, DEFAULT_COSTS).baselineStressDays).toBe(0)
  })
})
