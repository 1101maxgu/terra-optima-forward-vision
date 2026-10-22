import { describe, expect, it } from 'vitest'
import type { IrrigationEvent, SensorReading } from '../../types'
import { chartRows, dailySummary, historyTimeline, litresToMm, mmToLitres } from './helpers'

const r = (timestamp: string, pct: number, sensorId: string | null = 's1'): SensorReading => ({
  id: timestamp + sensorId, sensorId, zoneId: 'a', timestamp, soilMoisturePercent: pct, source: sensorId ? 'sample' : 'manual',
})
// Local-noon timestamps so day grouping is timezone-independent.
const at = (d: string, h = 12) => new Date(`${d}T${String(h).padStart(2, '0')}:00:00`).toISOString()

describe('zone helpers', () => {
  it('converts mm and litres over an area', () => {
    expect(mmToLitres(15, 2000)).toBe(30_000)
    expect(litresToMm(30_000, 2000)).toBe(15)
    expect(litresToMm(1000, 0)).toBe(0)
  })

  it('summarises readings per day, newest first', () => {
    const days = dailySummary([r(at('2026-10-20'), 20), r(at('2026-10-20', 14), 24), r(at('2026-10-21'), 30)])
    expect(days).toEqual([
      { date: '2026-10-21', count: 1, avgPct: 30, minPct: 30, maxPct: 30 },
      { date: '2026-10-20', count: 2, avgPct: 22, minPct: 20, maxPct: 24 },
    ])
  })

  it('merges events into the timeline above that day', () => {
    const ev: IrrigationEvent = { id: 'e', zoneId: 'a', timestamp: at('2026-10-20', 9), mm: 10, litres: 20_000 }
    const kinds = historyTimeline([r(at('2026-10-20'), 20), r(at('2026-10-21'), 25)], [ev]).map((i) => `${i.date}:${i.kind}`)
    expect(kinds).toEqual(['2026-10-21:readings', '2026-10-20:irrigation', '2026-10-20:readings'])
  })

  it('builds wide chart rows per series and drops old readings', () => {
    const since = Date.parse(at('2026-10-20'))
    const { rows, keys } = chartRows([r(at('2026-10-19'), 10), r(at('2026-10-20'), 20), r(at('2026-10-20'), 22, null)], since)
    expect(keys.sort()).toEqual(['manual', 's1'])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ s1: 20, manual: 22 })
  })
})
