import { expect, it } from 'vitest'
import { freshnessOf } from './farmStore'

const H = 3600_000
const now = Date.parse('2026-10-22T12:00:00Z')
const at = (hoursAgo: number) => new Date(now - hoursAgo * H).toISOString()

it('device readings: fresh ≤ 3 h, stale ≤ 24 h, then missing', () => {
  expect(freshnessOf({ timestamp: at(2.9), source: 'lorawan' }, now)).toBe('fresh')
  expect(freshnessOf({ timestamp: at(5), source: 'esp32' }, now)).toBe('stale')
  expect(freshnessOf({ timestamp: at(30), source: 'sample' }, now)).toBe('missing')
})

it('manual/CSV readings: fresh ≤ 24 h, stale ≤ 72 h', () => {
  expect(freshnessOf({ timestamp: at(20), source: 'manual' }, now)).toBe('fresh')
  expect(freshnessOf({ timestamp: at(50), source: 'csv' }, now)).toBe('stale')
  expect(freshnessOf({ timestamp: at(80), source: 'manual' }, now)).toBe('missing')
})
