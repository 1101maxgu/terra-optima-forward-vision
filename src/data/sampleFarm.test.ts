// Guards the demo's opening state: one zone needs water now, one soon, one is fine.
import { expect, test } from 'vitest'
import { SAMPLE_FARM, SAMPLE_READINGS } from './sampleFarm'
import sampleWeather from './sampleWeather.json'
import { recommend } from '../engine/irrigation'

test('default demo shows irrigate-now / irrigate-soon / ok', () => {
  const statuses = SAMPLE_FARM.zones.map((z) =>
    recommend(z, SAMPLE_READINGS.find((r) => r.zoneId === z.id)!, sampleWeather.days).status,
  )
  expect(statuses).toEqual(['irrigate-now', 'irrigate-soon', 'ok'])
})
