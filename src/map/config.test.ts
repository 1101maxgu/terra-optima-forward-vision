import { expect, it } from 'vitest'
import { buildMapConfig } from './config'
import { areaChipText, toGeoPolygon } from './geo'

it('defaults to OSM + Esri and lets env swap the satellite vendor', () => {
  const d = buildMapConfig()
  expect(d.standard.tiles[0]).toContain('tile.openstreetmap.org')
  expect(d.satellite.tiles[0]).toContain('World_Imagery')
  expect(d.satellite.attribution).toMatch(/Esri/)
  const c = buildMapConfig({
    VITE_SATELLITE_TILES: 'https://a.example/{z}/{x}/{y}.jpg, https://b.example/{z}/{x}/{y}.jpg',
    VITE_SATELLITE_ATTRIBUTION: '© Example',
  })
  expect(c.satellite.tiles).toEqual(['https://a.example/{z}/{x}/{y}.jpg', 'https://b.example/{z}/{x}/{y}.jpg'])
  expect(c.satellite.attribution).toBe('© Example')
  expect(buildMapConfig({ VITE_SATELLITE_TILES: ' ' }).satellite.tiles[0]).toContain('World_Imagery')
})

it('formats the area chip', () => {
  expect(areaChipText(2400, 'ha')).toBe('≈ 0.24 ha · 2,400 m²')
  expect(areaChipText(2400, 'm2')).toBe('≈ 2,400 m² · 0.24 ha')
  expect(areaChipText(2400, 'ac')).toBe('≈ 0.59 ac · 0.24 ha')
})

it('normalizes drawn rings: rounds, dedupes, closes', () => {
  const p = toGeoPolygon([[-122.123456789, 49.1], [-122.2, 49.1], [-122.2, 49.1], [-122.2, 49.2]])
  expect(p).toEqual({ type: 'Polygon', coordinates: [[[-122.1234568, 49.1], [-122.2, 49.1], [-122.2, 49.2], [-122.1234568, 49.1]]] })
  expect(toGeoPolygon(p!.coordinates[0])).toEqual(p) // already closed: not double-closed
  expect(toGeoPolygon([[0, 0], [1, 1], [1, 1]])).toBeNull()
})
