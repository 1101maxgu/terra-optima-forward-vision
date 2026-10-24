// Frozen contract shared by all agents. Changes go through the integrator.

/** Where a displayed number came from. Impact numbers are only ever 'projected'. */
export type Provenance = 'measured' | 'live-weather' | 'simulated' | 'estimated' | 'projected'

export type CropId = 'tomato' | 'lettuce' | 'blueberry' | 'strawberry'
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
  // Optional (v2). Legacy zones without a boundary keep working ("Map boundary not set").
  farmId?: string
  boundary?: GeoPolygon | null
  rootDepthMm?: number // overrides crop default
  efficiency?: number // overrides method default (0–1)
  notes?: string
  createdAt?: string
  updatedAt?: string
}

/** GeoJSON Polygon, [lon, lat] order, first ring is the outer boundary and is closed. */
export interface GeoPolygon {
  type: 'Polygon'
  coordinates: [number, number][][]
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
  confidence?: number // 0–1, lowest sensor trust in the zone; set by the store, not the engine
  discounted?: { sensorId: string; sensorName: string; reason: string }[] // probes left out of this recommendation
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
  baselineStressDays?: number // days the fixed schedule leaves the root zone below the refill point
  daily: { date: string; baselineLitres: number; geovivaLitres: number; moisture: number }[]
  provenance: 'projected'
}

export interface Farm {
  id?: string
  name: string
  location: string
  lat: number
  lon: number
  zones: Zone[]
}

// ---------- v2: sensors, readings, irrigation events ----------

export type SensorType = 'lorawan' | 'esp32' | 'manual'
export type LorawanProvider = 'ttn' | 'chirpstack'
export type ReadingSource = 'lorawan' | 'esp32' | 'manual' | 'csv' | 'sample'

export interface Sensor {
  id: string
  farmId: string
  name: string // farmer-facing name, e.g. "TTN-001"
  deviceId: string // provider device id / ESP32 claim id
  type: SensorType
  provider?: LorawanProvider
  depthCm: number
  zoneId: string | null // explicit assignment; the map never reassigns
  lat?: number
  lon?: number
  batteryPercent?: number
  lastSeen?: string // ISO
  createdAt: string
}

// ---------- sensor trust: is this probe's data believable? ----------

export type TrustVerdict = 'trusted' | 'uncertain' | 'likely-faulty' | 'real-event'
export type SignalKind = 'flatline' | 'out-of-range' | 'spike' | 'peer-disagree' | 'implausible' | 'battery' | 'real-event'

export interface Signal {
  kind: SignalKind
  detail: string // plain language, one sentence
  weight: number // how much it lowers confidence (0–1)
}

export interface SensorAssessment {
  sensorId: string
  verdict: TrustVerdict
  confidence: number // 0–1
  signals: Signal[]
  explanation: string
  action: string // what the farmer should do
  since?: string // ISO, when the problem started
  ack?: 'fine' | 'ignore' // farmer's response; 'fine' re-includes the probe, 'ignore' only silences alerts
}

/** Normalized reading shape shared by all sources (matches the backend table). */
export interface SensorReading {
  id: string
  sensorId: string | null // null for manual readings not tied to a device
  zoneId: string
  timestamp: string // ISO
  soilMoisturePercent: number // 0–100 volumetric
  soilTemperatureC?: number
  depthCm?: number
  batteryPercent?: number
  source: ReadingSource
}

export interface IrrigationEvent {
  id: string
  zoneId: string
  timestamp: string
  mm: number
  litres: number
  note?: string
  source?: 'manual' | 'sample'
}

export type Freshness = 'fresh' | 'stale' | 'missing'
/** Plain-language status shown to farmers. */
export type FarmerStatus = 'water-today' | 'water-soon' | 'no-water' | 'check-sensor'

export interface FarmData {
  farm: Required<Pick<Farm, 'id' | 'name' | 'location' | 'lat' | 'lon'>>
  zones: Zone[]
  sensors: Sensor[]
  readings: SensorReading[]
  events: IrrigationEvent[]
}

export interface CsvResult {
  readings: Reading[]
  errors: string[] // human-readable, line-numbered
}
