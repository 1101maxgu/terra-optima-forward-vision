// PLACEHOLDER — Agent C refines. Shape is frozen.
import type { Farm, Reading } from '../types'

export const SAMPLE_FARM: Farm = {
  name: 'Sample Farm',
  location: 'Abbotsford, BC',
  lat: 49.05,
  lon: -122.3,
  zones: [
    { id: 'a', name: 'Zone A', cropId: 'tomato', soilId: 'loam', method: 'drip', areaM2: 400 },
    { id: 'b', name: 'Zone B', cropId: 'lettuce', soilId: 'sandy-loam', method: 'sprinkler', areaM2: 250 },
    { id: 'c', name: 'Zone C', cropId: 'blueberry', soilId: 'silt-loam', method: 'drip', areaM2: 350 },
  ],
}

/** Latest simulated reading per zone. */
export const SAMPLE_READINGS: Reading[] = [
  { zoneId: 'a', timestamp: '2026-10-21T07:00:00-07:00', moisture: 0.19, soilTempC: 14, provenance: 'simulated' },
  { zoneId: 'b', timestamp: '2026-10-21T07:00:00-07:00', moisture: 0.17, soilTempC: 13, provenance: 'simulated' },
  { zoneId: 'c', timestamp: '2026-10-21T07:00:00-07:00', moisture: 0.29, soilTempC: 12, provenance: 'simulated' },
]
