import { expect, it } from 'vitest'
import { BUNDLE, bundleListPrice, estimateCost, EXTRA_SENSOR, FREE, GROWER, limitsFor, needsGrower, SENSOR, WORKED_EXAMPLE } from './plans'

it('yearly prices are 10 months of the monthly price', () => {
  expect(GROWER.yearly).toBe(GROWER.monthly * 10)
  expect(EXTRA_SENSOR.yearly).toBe(EXTRA_SENSOR.monthly * 10)
})

it('the bundle is cheaper than buying the parts separately, and sensors are near cost', () => {
  expect(BUNDLE.price).toBeLessThan(bundleListPrice)
  expect(SENSOR.price).toBeGreaterThanOrEqual(SENSOR.partsCost)
})

it('free covers 2 zones and 1 sensor; anything more needs Grower', () => {
  expect(needsGrower(FREE.zones, FREE.sensors)).toBe(false)
  expect(needsGrower(FREE.zones + 1, 0)).toBe(true)
  expect(needsGrower(1, FREE.sensors + 1)).toBe(true)
})

it('worked example: 4 zones, 4 sensors, Starter bundle', () => {
  const e = estimateCost(WORKED_EXAMPLE)
  expect(e.plan).toBe('grower')
  // bundle 349 + 4th sensor 99 + its yearly fee 30 + shipping 12
  expect(e.firstYearTotal).toBe(490)
  expect(e.laterYearTotal).toBe(110)
})

it('own sensors on the free plan cost nothing', () => {
  const e = estimateCost({ zones: 2, sensors: 1, billing: 'monthly', hardware: 'own' })
  expect(e.plan).toBe('free')
  expect(e.firstYearTotal).toBe(0)
  expect(e.laterYearTotal).toBe(0)
})

it('sensor only: one sensor works on the free plan', () => {
  const e = estimateCost({ zones: 1, sensors: 1, billing: 'yearly', hardware: 'buy' })
  expect(e.plan).toBe('free')
  expect(e.firstYearTotal).toBe(SENSOR.price + SENSOR.shipping)
  expect(e.laterYearTotal).toBe(0)
})

it('monthly billing for own sensors with extras', () => {
  const e = estimateCost({ zones: 5, sensors: 5, billing: 'monthly', hardware: 'own' })
  expect(e.firstYearTotal).toBe(GROWER.monthly * 12 + 2 * EXTRA_SENSOR.monthly * 12)
  expect(e.laterYearTotal).toBe(e.firstYearTotal)
})

it('limits grow with paid extra sensors', () => {
  expect(limitsFor('free')).toMatchObject({ zones: 2, sensors: 1, reportDays: 7 })
  expect(limitsFor('grower', 2)).toMatchObject({ zones: null, sensors: 5, reportDays: 30 })
})
