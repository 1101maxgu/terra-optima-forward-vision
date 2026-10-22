// Server-side zone boundary validation. Mirrors src/map/geo.ts (the client check) but cannot
// import it: server code runs as Node ESM and src/ uses extensionless imports.
import turfArea from '@turf/area'
import kinks from '@turf/kinks'
import type { GeoPolygon } from '../src/types.js'

export const MIN_ZONE_AREA_M2 = 10
export const MAX_ZONE_AREA_M2 = 1e8 // 10 000 ha; anything larger is a drawing mistake

export function polygonAreaM2(p: GeoPolygon): number {
  return turfArea({ type: 'Feature', properties: {}, geometry: p })
}

/** Returns a farmer-readable problem, or null if the polygon is valid. */
export function polygonProblem(p: GeoPolygon): string | null {
  if (p.type !== 'Polygon' || !Array.isArray(p.coordinates) || p.coordinates.length === 0) return 'Boundary must be a GeoJSON Polygon.'
  for (const ring of p.coordinates) {
    if (ring.length < 4) return 'Each ring needs at least 4 positions (3 corners + closing point).'
    if (ring.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 180 || Math.abs(y) > 90))
      return 'Coordinates must be [longitude, latitude] within valid ranges.'
    const [fx, fy] = ring[0]
    const [lx, ly] = ring[ring.length - 1]
    if (fx !== lx || fy !== ly) return 'The boundary is not closed (first and last positions differ).'
  }
  if (kinks({ type: 'Feature', properties: {}, geometry: p }).features.length > 0) return 'The boundary crosses itself.'
  const a = polygonAreaM2(p)
  if (!Number.isFinite(a) || a < MIN_ZONE_AREA_M2) return `The zone is too small (minimum ${MIN_ZONE_AREA_M2} m²).`
  if (a > MAX_ZONE_AREA_M2) return 'The zone is unrealistically large.'
  return null
}
