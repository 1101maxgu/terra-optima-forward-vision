// Frozen contract shared by all agents. Changes go through the integrator.

/** Where a displayed number came from. Impact numbers are only ever 'projected'. */
export type Provenance = 'measured' | 'live-weather' | 'simulated' | 'estimated' | 'projected'

export type CropId = 'tomato' | 'lettuce' | 'blueberry'
export type SoilId = 'sandy-loam' | 'loam' | 'silt-loam'
export type IrrigationMethod = 'drip' | 'sprinkler'

export interface Crop {
  id: CropId
  name: string
  kc: number // mid-season crop coefficient (FAO-56)
  rootDepthMm: number // effective root zone depth
  p: number // allowed depletion fraction before stress (FAO-56 Table 22)
  source: string // citation shown in-app
}

export interface Soil {
  id: SoilId
  name: string
  fieldCapacity: number // volumetric water content, m3/m3 (e.g. 0.30)
  wiltingPoint: number // m3/m3
  source: string
}

export interface Zone {
  id: string
  name: string
  cropId: CropId
  soilId: SoilId
  method: IrrigationMethod
  areaM2: number
}

export interface Reading {
  zoneId: string
  timestamp: string // ISO 8601
  moisture: number // volumetric water content, m3/m3
  soilTempC: number
  provenance: Provenance
}

export interface WeatherDay {
  date: string // YYYY-MM-DD
  tMaxC: number
  tMinC: number
  rainMm: number
  et0Mm: number // FAO-56 reference evapotranspiration
}

export interface Weather {
  days: WeatherDay[] // days[0] = today, at least 14 days
  source: 'live' | 'cache' | 'bundled'
  provenance: Provenance // 'live-weather' for live/cache, 'simulated' for bundled
  fetchedAt?: string
}

/** Judge/demo overrides for one zone. Undefined fields fall back to real data. */
export interface ScenarioOverrides {
  moisture?: number // m3/m3
  rainNext48hMm?: number // replaces forecast rain over the 48 h horizon
  et0Mm?: number // replaces daily ET0
}

export type RecStatus = 'irrigate-now' | 'irrigate-soon' | 'ok' | 'skip-rain'

export interface Factor {
  label: string // e.g. "Soil moisture"
  value: string // e.g. "18% (refill point 22%)"
  effect: 'raises' | 'lowers' | 'neutral' // effect on irrigation need
  provenance: Provenance
}

export interface Recommendation {
  zoneId: string
  status: RecStatus
  netMm: number // water needed in root zone (0 if not irrigating)
  grossMm: number // netMm / method efficiency
  litres: number // grossMm * areaM2
  timing: string // e.g. "Tonight, 8–10 pm"
  tawMm: number // total available water
  rawMm: number // readily available water (refill threshold as depletion)
  depletionMm: number // current root-zone depletion
  projectedDepletionMm: number // depletion after 48 h horizon
  refillMoisture: number // m3/m3 at which depletion == RAW
  factors: Factor[]
  summary: string // one sentence built from the numbers above
}

export interface FixedSchedule {
  mmPerEvent: number // default 15
  eventsPerWeek: number // default 3
}

export interface WaterComparison {
  zoneId: string
  baselineLitres: number
  geovivaLitres: number
  avoidedLitres: number
  reductionPct: number
  daily: { date: string; baselineLitres: number; geovivaLitres: number; moisture: number }[]
  provenance: 'projected'
}

export interface Farm {
  name: string
  location: string
  lat: number
  lon: number
  zones: Zone[]
}

export interface CsvResult {
  readings: Reading[]
  errors: string[] // human-readable, line-numbered
}
