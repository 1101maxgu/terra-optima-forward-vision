// PLACEHOLDER — Agent A replaces with cited values.
import type { Soil, SoilId } from '../types'

export const SOILS: Record<SoilId, Soil> = {
  'sandy-loam': { id: 'sandy-loam', name: 'Sandy loam', fieldCapacity: 0.23, wiltingPoint: 0.1, source: 'TBD' },
  loam: { id: 'loam', name: 'Loam', fieldCapacity: 0.3, wiltingPoint: 0.13, source: 'TBD' },
  'silt-loam': { id: 'silt-loam', name: 'Silt loam', fieldCapacity: 0.33, wiltingPoint: 0.15, source: 'TBD' },
}
