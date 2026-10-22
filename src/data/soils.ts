// Soil constants. Each value falls within the FAO-56 Table 19 range, chosen so that
// FC − WP matches the BC available water storage capacity (Factsheet 619.000-1, Table 2).
// To be reviewed by an agronomist before field use.
import type { Soil, SoilId } from '../types'

export const SOILS: Record<SoilId, Soil> = {
  'sandy-loam': {
    id: 'sandy-loam',
    name: 'Sandy loam',
    fieldCapacity: 0.23,
    wiltingPoint: 0.11,
    source: 'FAO-56 Table 19 (θFC 0.18–0.28, θWP 0.06–0.16), roughly mid-range; gives 120 mm/m available water vs. 125 mm/m in BC Factsheet 619.000-1, Table 2.',
  },
  loam: {
    id: 'loam',
    name: 'Loam',
    fieldCapacity: 0.3,
    wiltingPoint: 0.13,
    source: 'FAO-56 Table 19 (θFC 0.20–0.30, θWP 0.07–0.17); gives 170 mm/m available water vs. 175 mm/m in BC Factsheet 619.000-1, Table 2.',
  },
  'silt-loam': {
    id: 'silt-loam',
    name: 'Silt loam',
    fieldCapacity: 0.34,
    wiltingPoint: 0.13,
    source: 'FAO-56 Table 19 (θFC 0.22–0.36, θWP 0.09–0.21); gives 210 mm/m available water vs. 208 mm/m in BC Factsheet 619.000-1, Table 2.',
  },
}
