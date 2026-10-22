import { expect, it } from 'vitest'
import { buildZone, firstInvalidStep, newDraft, parseDraft, serializeDraft, stepError } from './draft'
import type { GeoPolygon } from '../../types'

const dLon = 100 / 73_000
const dLat = 100 / 111_200
const square: GeoPolygon = {
  type: 'Polygon',
  coordinates: [[[-122.3, 49.05], [-122.3 + dLon, 49.05], [-122.3 + dLon, 49.05 + dLat], [-122.3, 49.05 + dLat], [-122.3, 49.05]]],
}

it('round-trips a draft and rejects junk', () => {
  const d = { ...newDraft([-122.3, 49.05], 'Zone 3'), boundary: square, step: 2 }
  expect(parseDraft(serializeDraft(d))).toEqual(d)
  expect(parseDraft(null)).toBeNull()
  expect(parseDraft('not json')).toBeNull()
  expect(parseDraft('{"v":2}')).toBeNull()
  expect(parseDraft(serializeDraft({ ...d, step: 99 }))!.step).toBe(4)
})

it('blocks steps until the boundary and details are valid', () => {
  const d = newDraft([-122.3, 49.05], 'Zone 1')
  expect(stepError(d, 1)).toMatch(/No boundary/)
  expect(firstInvalidStep(d)).toBe(1)
  const drawn = { ...d, boundary: square }
  expect(firstInvalidStep(drawn)).toBe(-1)
  expect(stepError({ ...drawn, name: ' ' }, 2)).toMatch(/name/)
  expect(stepError({ ...drawn, efficiencyPct: 10 }, 2)).toMatch(/Efficiency/)
  expect(stepError({ ...drawn, manualReadingPct: 120 }, 3)).toMatch(/moisture/)
  // Skipping the map requires a manual area instead.
  const skipped = { ...d, skipBoundary: true }
  expect(stepError(skipped, 1)).toBeNull()
  expect(stepError(skipped, 2)).toMatch(/area/)
  expect(stepError({ ...skipped, manualAreaM2: 500 }, 2)).toBeNull()
})

it('builds a zone with rounded area and only the overrides the farmer set', () => {
  const z = buildZone({ ...newDraft([0, 0], ' North beds '), boundary: square, efficiencyPct: 85 })
  expect(z.name).toBe('North beds')
  expect(Number.isInteger(z.areaM2)).toBe(true)
  expect(Math.abs(z.areaM2 - 10_000)).toBeLessThan(200)
  expect(z.efficiency).toBe(0.85)
  expect('rootDepthMm' in z).toBe(false)
  expect(z.boundary).toEqual(square)
  expect(buildZone({ ...newDraft([0, 0], 'A'), boundary: square, skipBoundary: true, manualAreaM2: 321.6 })).toMatchObject({ boundary: null, areaM2: 322 })
})
