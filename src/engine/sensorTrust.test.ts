import { expect, test } from 'vitest'
import type { IrrigationEvent, Sensor, SensorReading, WeatherDay } from '../types'
import { assessSensors } from './sensorTrust'
import { applyAcks, isExcluded } from '../state/farmStore'
import { buildSampleData } from '../data/sampleDataset'
import sampleWeather from '../data/sampleWeather.json'

const H = 3600_000
const NOW = Date.parse('2026-07-10T12:00:00Z')
const DRY: WeatherDay[] = [{ date: '2026-07-10', tMaxC: 26, tMinC: 12, rainMm: 0, et0Mm: 5 }]
const WET: WeatherDay[] = [{ ...DRY[0], rainMm: 20 }]

const sensor = (id: string, zoneId = 'a', batteryPercent = 80): Sensor =>
  ({ id, farmId: 'f', name: id.toUpperCase(), deviceId: id, type: 'lorawan', depthCm: 20, zoneId, batteryPercent, createdAt: '' })
/** Readings every 6 h ending at NOW; values[last] is the newest. */
const series = (sensorId: string, values: number[], zoneId = 'a', temp = 15, batteryPercent?: number): SensorReading[] =>
  values.map((v, i) => ({
    id: `${sensorId}-${i}`, sensorId, zoneId, timestamp: new Date(NOW - (values.length - 1 - i) * 6 * H).toISOString(),
    soilMoisturePercent: v, soilTemperatureC: temp, batteryPercent, source: 'lorawan',
  }))
const drying = (from: number, n = 8) => Array.from({ length: n }, (_, i) => from - 0.3 * i)
const run = (sensors: Sensor[], readings: SensorReading[], days = DRY, events: IrrigationEvent[] = []) => assessSensors(sensors, readings, days, events, NOW)

test('healthy drying series is trusted', () => {
  const a = run([sensor('s1')], series('s1', drying(30)))
  expect(a.s1.verdict).toBe('trusted')
  expect(a.s1.signals).toEqual([])
})

test('stuck value is flagged likely faulty with an explanation and action', () => {
  const a = run([sensor('s1')], series('s1', [32, 31.7, 31.2, 31.2, 31.2, 31.2]))
  expect(a.s1.verdict).toBe('likely-faulty')
  expect(a.s1.explanation).toMatch(/31\.2% for 18 h/)
  expect(a.s1.action).toMatch(/probe/)
  expect(a.s1.since).toBe(new Date(NOW - 18 * H).toISOString())
})

test('two equal readings are not enough for a flatline', () => {
  expect(run([sensor('s1')], series('s1', [32, 31.7, 31.2, 31.2])).s1.verdict).toBe('trusted')
})

test('impossible values are faulty', () => {
  expect(run([sensor('s1')], series('s1', [...drying(30, 4), 0])).s1.verdict).toBe('likely-faulty')
  expect(run([sensor('s1')], series('s1', drying(30), 'a', 85)).s1.signals.map((s) => s.kind)).toContain('out-of-range')
})

test('unexplained jump is uncertain; the same jump after rain or irrigation is a real event', () => {
  const vals = [...drying(20, 5), 38]
  expect(run([sensor('s1')], series('s1', vals)).s1.verdict).toBe('uncertain')
  expect(run([sensor('s1')], series('s1', vals), WET).s1.verdict).toBe('real-event')
  const watered: IrrigationEvent = { id: 'e', zoneId: 'a', timestamp: new Date(NOW - 2 * H).toISOString(), mm: 15, litres: 1 }
  expect(run([sensor('s1')], series('s1', vals), DRY, [watered]).s1.verdict).toBe('real-event')
})

test('gradual rise with no water source lowers confidence', () => {
  const a = run([sensor('s1')], series('s1', [20, 21, 22, 23, 24, 25]))
  expect(a.s1.signals.map((s) => s.kind)).toContain('implausible')
  expect(a.s1.confidence).toBeLessThan(1)
})

test('probe far from its zone peers is flagged; the healthy peers are not', () => {
  const sensors = [sensor('s1'), sensor('s2'), sensor('s3')]
  const readings = [...series('s1', drying(30)), ...series('s2', drying(30.5)), ...series('s3', drying(45))]
  const a = run(sensors, readings)
  expect(a.s3.signals.map((s) => s.kind)).toContain('peer-disagree')
  expect(a.s3.verdict).toBe('uncertain')
  expect(a.s1.verdict).toBe('trusted')
})

test('with one peer, the suspect probe takes the blame, not the healthy one', () => {
  const a = run([sensor('s1'), sensor('s2')], [...series('s1', drying(30)), ...series('s2', [45, 45, 45, 45, 45])])
  expect(a.s2.verdict).toBe('likely-faulty')
  expect(a.s1.verdict).toBe('trusted')
})

test('low battery is noted but alone keeps the probe trusted', () => {
  const a = run([sensor('s1')], series('s1', drying(30), 'a', 15, 12))
  expect(a.s1.signals.map((s) => s.kind)).toEqual(['battery'])
  expect(a.s1.verdict).toBe('trusted')
})

test('sensors with only old readings are not assessed', () => {
  const old = series('s1', [31.2, 31.2, 31.2, 31.2]).map((r) => ({ ...r, timestamp: new Date(Date.parse(r.timestamp) - 48 * H).toISOString() }))
  expect(run([sensor('s1')], old).s1).toBeUndefined()
})

test('acknowledgements: fine re-includes, ignore keeps excluded, a new kind of problem flags again', () => {
  const raw = run([sensor('s1')], series('s1', [32, 31.2, 31.2, 31.2, 31.2]))
  expect(isExcluded(raw.s1)).toBe(true)
  expect(isExcluded(applyAcks(raw, { s1: { mode: 'fine', kinds: ['flatline'] } }).s1)).toBe(false)
  expect(isExcluded(applyAcks(raw, { s1: { mode: 'ignore', kinds: ['flatline'] } }).s1)).toBe(true)
  expect(applyAcks(raw, { s1: { mode: 'fine', kinds: ['spike'] } }).s1.ack).toBeUndefined()
})

test('sample farm demos one faulty and one uncertain probe, and no false alarms on the rest', () => {
  const now = Date.now()
  const d = buildSampleData(now)
  const a = assessSensors(d.sensors, d.readings, sampleWeather.days, d.events, now)
  expect(a.s2.verdict).toBe('likely-faulty')
  expect(a.s4.verdict).toBe('uncertain')
  expect(a.s1.verdict).toBe('trusted')
  expect(a.s3.verdict).toBe('trusted') // low battery only
})
