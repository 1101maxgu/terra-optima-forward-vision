// Public map API (frozen). Components are lazy-loaded so MapLibre stays out of the initial bundle.
// Wrap usages in <Suspense fallback={<MapSkeleton/>}>.
import { lazy } from 'react'
import type { FarmerStatus, GeoPolygon, Sensor, Zone } from '../types'

export type LngLat = [number, number] // [lon, lat]

export interface FarmMapProps {
  zones: Zone[] // zones without boundary are skipped
  statuses?: Record<string, { status: FarmerStatus; label: string }> // label e.g. "22%"
  sensors?: Sensor[] // only those with lat/lon are drawn
  selectedZoneId?: string | null
  onZoneClick?: (zoneId: string) => void
  onMapClick?: (p: LngLat) => void // e.g. "tap a point to place this sensor"
  fallbackCenter: LngLat // used when no zone boundaries exist
  fit?: 'all' | 'selected' // which boundaries to frame
  className?: string // set the height here, e.g. "h-80"
}

export interface ZoneDrawMapProps {
  value: GeoPolygon | null // existing boundary to edit, or null to draw new
  onChange: (polygon: GeoPolygon | null, areaM2: number | null, error: string | null) => void
  center: LngLat
  zoom?: number
  otherZones?: Zone[] // shown faintly for context
  className?: string
}

export interface FarmLocatorProps {
  value: { center: LngLat; zoom: number }
  onChange: (v: { center: LngLat; zoom: number; label?: string }) => void
  className?: string
}

export const FarmMap = lazy(() => import('./FarmMap'))
export const ZoneDrawMap = lazy(() => import('./ZoneDrawMap'))
export const FarmLocator = lazy(() => import('./FarmLocator'))
export { default as MapSkeleton } from './MapSkeleton'
