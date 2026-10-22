import { expect, it } from 'vitest'
import { polygonAreaM2, validatePolygon, pointInPolygon } from './geo'
import type { GeoPolygon } from '../types'

// ~100 m x ~100 m square near Abbotsford (lat 49°): 1° lon ≈ 73.0 km, 1° lat ≈ 111.2 km.
const dLon = 100 / 73_000
const dLat = 100 / 111_200
const square: GeoPolygon = {
  type: 'Polygon',
  coordinates: [[[-122.3, 49.05], [-122.3 + dLon, 49.05], [-122.3 + dLon, 49.05 + dLat], [-122.3, 49.05 + dLat], [-122.3, 49.05]]],
}

it('computes geodesic area within 2% of 10,000 m²', () => {
  expect(Math.abs(polygonAreaM2(square) - 10_000) / 10_000).toBeLessThan(0.02)
})

it('validates good, open, self-intersecting and tiny polygons', () => {
  expect(validatePolygon(square)).toBeNull()
  const open: GeoPolygon = { type: 'Polygon', coordinates: [square.coordinates[0].slice(0, -1)] }
  expect(validatePolygon(open)).toMatch(/not closed/)
  const [a, b, c, d] = square.coordinates[0]
  expect(validatePolygon({ type: 'Polygon', coordinates: [[a, c, b, d, a]] })).toMatch(/crosses itself/)
  const tiny: GeoPolygon = { type: 'Polygon', coordinates: [[[0, 0], [0.00001, 0], [0.00001, 0.00001], [0, 0]]] }
  expect(validatePolygon(tiny)).toMatch(/very small/)
  expect(validatePolygon(null)).toMatch(/No boundary/)
})

it('point in polygon', () => {
  expect(pointInPolygon(-122.3 + dLon / 2, 49.05 + dLat / 2, square)).toBe(true)
  expect(pointInPolygon(-122.0, 49.0, square)).toBe(false)
})
