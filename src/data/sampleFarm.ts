// Fictional demo farm. Shape is frozen (store imports SAMPLE_FARM / SAMPLE_READINGS).
import type { Farm, Reading } from '../types'

/** ~2-acre (8,100 m²) Fraser Valley market garden; ~1.6 acres cropped across 3 zones, rest is paths/wash-pack. */
export const SAMPLE_FARM: Farm = {
  name: 'Riverbend Market Garden (fictional demo farm)',
  location: 'Abbotsford, BC (Fraser Valley)',
  lat: 49.05,
  lon: -122.3,
  zones: [
    { id: 'a', name: 'Zone A · Field tomatoes', cropId: 'tomato', soilId: 'loam', method: 'drip', areaM2: 2000 },
    { id: 'b', name: 'Zone B · Salad lettuce', cropId: 'lettuce', soilId: 'sandy-loam', method: 'sprinkler', areaM2: 1400 },
    { id: 'c', name: 'Zone C · Blueberries', cropId: 'blueberry', soilId: 'silt-loam', method: 'drip', areaM2: 3200 },
  ],
}

/** Latest simulated reading per zone. */
export const SAMPLE_READINGS: Reading[] = [
  { zoneId: 'a', timestamp: '2026-10-21T07:00:00-07:00', moisture: 0.19, soilTempC: 14, provenance: 'simulated' },
  { zoneId: 'b', timestamp: '2026-10-21T07:00:00-07:00', moisture: 0.21, soilTempC: 13, provenance: 'simulated' },
  { zoneId: 'c', timestamp: '2026-10-21T07:00:00-07:00', moisture: 0.29, soilTempC: 12, provenance: 'simulated' },
]
