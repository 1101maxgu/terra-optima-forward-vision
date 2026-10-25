import { expect, it } from 'vitest'
import { estimateCost, FREE, limitsFor, RENTAL, SEASON, WORKED_EXAMPLE } from './plans'

it('the new pricing: $100 a season and $50 a sensor', () => {
  expect(SEASON.price).toBe(100)
  expect(SEASON.months).toBe(4)
  expect(RENTAL.price).toBe(50)
})

it('worked example: Season plan and 3 rented sensors', () => {
  const e = estimateCost(WORKED_EXAMPLE)
  expect(e.total).toBe(250)
  expect(e.lines).toHaveLength(2)
})

it('Free with no sensors costs nothing, and renting works on Free too', () => {
  expect(estimateCost({ season: false, sensors: 0 }).total).toBe(0)
  expect(estimateCost({ season: false, sensors: 2 }).total).toBe(100)
})

it('Free has no zone or sensor cap, but no assistant or text alerts', () => {
  expect(limitsFor('free')).toMatchObject({ zones: null, sensors: FREE.sensors, reportDays: 7, assistant: false, textAlerts: false })
  expect(limitsFor('grower')).toMatchObject({ zones: null, reportDays: 30, assistant: true, textAlerts: true })
})
