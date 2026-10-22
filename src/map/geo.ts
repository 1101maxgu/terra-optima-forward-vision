// Geometry helpers on real lon/lat coordinates (never map pixels).
import turfArea from '@turf/area'
import kinks from '@turf/kinks'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import type { GeoPolygon } from '../types'

export const MIN_ZONE_AREA_M2 = 10

/** Geodesic area of a GeoJSON polygon in m². */
export function polygonAreaM2(p: GeoPolygon): number {
  return turfArea({ type: 'Feature', properties: {}, geometry: p })
}

/** Returns a farmer-readable problem, or null if the polygon is usable. */
export function validatePolygon(p: GeoPolygon | null | undefined): string | null {
  const ring = p?.coordinates?.[0]
  if (!p || p.type !== 'Polygon' || !ring) return 'No boundary drawn yet.'
  if (ring.length < 4) return 'Add at least 3 corners.'
  if (ring.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(y) > 90 || Math.abs(x) > 180))
    return 'The boundary has invalid coordinates.'
  const [fx, fy] = ring[0]
  const [lx, ly] = ring[ring.length - 1]
  if (fx !== lx || fy !== ly) return 'The boundary is not closed.'
  if (kinks({ type: 'Feature', properties: {}, geometry: p }).features.length > 0)
    return 'The boundary crosses itself. Move a corner so the lines don’t cross.'
  const a = polygonAreaM2(p)
  if (!Number.isFinite(a)) return 'Could not calculate the area of this boundary.'
  if (a < MIN_ZONE_AREA_M2) return `This zone is very small (${Math.round(a)} m²). Draw a larger area.`
  return null
}

export function pointInPolygon(lon: number, lat: number, p: GeoPolygon): boolean {
  return booleanPointInPolygon([lon, lat], p)
}

/** Simple average of the outer ring's corners — good enough for labels and centring. */
export function polygonCenter(p: GeoPolygon): [number, number] {
  const ring = p.coordinates[0].slice(0, -1)
  const [sx, sy] = ring.reduce(([ax, ay], [x, y]) => [ax + x, ay + y], [0, 0])
  return [sx / ring.length, sy / ring.length]
}

/** [[west, south], [east, north]] around one or more polygons. */
export function bounds(polys: GeoPolygon[]): [[number, number], [number, number]] | null {
  const pts = polys.flatMap((p) => p.coordinates[0])
  if (!pts.length) return null
  const xs = pts.map((c) => c[0])
  const ys = pts.map((c) => c[1])
  return [
    [Math.min(...xs), Math.min(...ys)],
    [Math.max(...xs), Math.max(...ys)],
  ]
}

export type AreaUnit = 'm2' | 'ha' | 'ac'
export function formatArea(m2: number, unit: AreaUnit = m2 >= 5000 ? 'ha' : 'm2'): string {
  if (unit === 'ha') return `${(m2 / 10_000).toFixed(2)} ha`
  if (unit === 'ac') return `${(m2 / 4046.856).toFixed(2)} ac`
  return `${Math.round(m2).toLocaleString('en-CA')} m²`
}
