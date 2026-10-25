import { expect, it } from 'vitest'
import { searchTopics, topicById, TOPICS } from './content'
import { buildContext, type ContextInput } from '../services/assistantApi'
import type { ZoneStatus } from '../state/farmStore'
import type { Sensor, Zone } from '../types'

it('has unique topic ids and every topic has content', () => {
  expect(new Set(TOPICS.map((t) => t.id)).size).toBe(TOPICS.length)
  for (const t of TOPICS) expect(t.blocks.length).toBeGreaterThan(0)
  expect(topicById('hardware')?.title).toMatch(/Hardware/)
  expect(topicById('nope')).toBeUndefined()
})

it('offline search finds the right topic for farmer wording', () => {
  expect(searchTopics('battery drains fast')[0].id).toBe('hardware')
  expect(searchTopics('how do I draw a zone')[0].id).toBe('zones')
  expect(searchTopics('how do I draw a field section')[0].id).toBe('zones')
  expect(searchTopics('what works without internet')[0].id).toBe('offline')
  expect(searchTopics('a')).toEqual([])
  expect(searchTopics('zzzz qqqq')).toEqual([])
})

const zone = { id: 'z1', name: 'North beds', cropId: 'lettuce', soilId: 'loam', method: 'drip', areaM2: 400 } as Zone
const other = { ...zone, id: 'z2', name: 'South field' } as Zone
const sensor = { id: 's1', name: 'Probe 1', type: 'esp32', zoneId: 'z1', batteryPercent: 40 } as Sensor
const zs: ZoneStatus = {
  status: 'water-today', freshness: 'fresh', moisturePct: 18, soilTempC: null, lastUpdate: null, sensors: [sensor], discounted: [],
  rec: { summary: 'Soil is below refill.', grossMm: 12, litres: 4800, timing: 'Tonight', factors: [{ label: 'Soil moisture', value: '18%', effect: 'raises', provenance: 'measured' }] } as unknown as ZoneStatus['rec'],
}
const base: ContextInput = { dataset: 'mine', route: '/', zones: [zone, other], sensors: [sensor], zoneStatus: () => zs, sensorState: () => 'online' }

it('describes the Sample farm too, so the demo can show detailed answers', () => {
  expect(buildContext({ ...base, dataset: 'sample' })).toContain('Screen: /')
})

it('summarises all zones on general screens, without sensor detail', () => {
  const c = buildContext(base)!
  expect(c).toContain('North beds')
  expect(c).toContain('South field')
  expect(c).toContain('Water today')
  expect(c).not.toContain('Probe 1')
})

it('describes only the open zone, with its why-factors and sensors', () => {
  const c = buildContext({ ...base, route: '/zones/z1' })!
  expect(c).not.toContain('South field')
  expect(c).toContain('Soil moisture: 18% (raises need)')
  expect(c).toContain('Probe 1')
  expect(c).toContain('battery 40%')
})
