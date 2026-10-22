// zod schemas for every payload the API accepts. Unknown keys are stripped, not stored.
import { z } from 'zod'
import type { CropId, IrrigationMethod, SoilId } from '../src/types.js'
import { polygonProblem } from './geo.js'

export const CROP_IDS = ['tomato', 'lettuce', 'blueberry', 'strawberry'] as const satisfies readonly CropId[]
export const SOIL_IDS = ['sandy-loam', 'loam', 'silt-loam'] as const satisfies readonly SoilId[]
export const METHODS = ['drip', 'sprinkler'] as const satisfies readonly IrrigationMethod[]

/** Readings/events may not be more than 5 minutes in the future (clock skew allowance). */
export const MAX_FUTURE_MS = 5 * 60_000
const EARLIEST = Date.parse('2000-01-01T00:00:00Z')

/** ISO 8601 timestamp -> normalized ISO string; rejects far-future and pre-2000 values. */
export const timestamp = (now: () => number = Date.now) =>
  z
    .string()
    .max(40)
    .refine((s) => Number.isFinite(Date.parse(s)), 'Must be an ISO 8601 timestamp')
    .refine((s) => Date.parse(s) <= now() + MAX_FUTURE_MS, 'Timestamp is in the future')
    .refine((s) => Date.parse(s) >= EARLIEST, 'Timestamp is too old')
    .transform((s) => new Date(s).toISOString())

const name = z.string().trim().min(1).max(80)
const lat = z.number().min(-90).max(90)
const lon = z.number().min(-180).max(180)
export const moisturePercent = z.number().min(0).max(100)
export const soilTempC = z.number().min(-40).max(85)
export const batteryPercent = z.number().min(0).max(100)
export const depthCm = z.number().gt(0).max(300)

export const polygon = z
  .object({
    type: z.literal('Polygon'),
    coordinates: z.array(z.array(z.tuple([z.number(), z.number()])).min(4).max(2000)).min(1).max(20),
  })
  .superRefine((p, ctx) => {
    const problem = polygonProblem(p)
    if (problem) ctx.addIssue({ code: 'custom', message: problem })
  })

export const farmCreate = z.object({
  name: name.default('My farm'),
  location: z.string().trim().max(200).default(''),
  lat,
  lon,
})
export const farmPatch = farmCreate.partial()

const zoneFields = {
  name,
  cropId: z.enum(CROP_IDS),
  soilId: z.enum(SOIL_IDS),
  method: z.enum(METHODS),
  areaM2: z.number().positive().max(1e8).optional(), // only used for legacy zones without a boundary
  boundary: polygon.nullable().optional(),
  rootDepthMm: z.number().positive().max(5000).optional(),
  efficiency: z.number().gt(0).max(1).optional(),
  notes: z.string().max(2000).optional(),
}
export const zoneCreate = z
  .object({ id: z.uuid().optional(), ...zoneFields })
  .refine((v) => v.boundary || v.areaM2, 'A zone needs a boundary or an area')
export const zonePatch = z.object(zoneFields).partial()

const deviceId = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, 'Invalid device id')
export const sensorCreate = z.object({
  id: z.uuid().optional(),
  name,
  deviceId,
  type: z.enum(['lorawan', 'esp32', 'manual']),
  provider: z.enum(['ttn', 'chirpstack']).optional(),
  depthCm: depthCm.default(15),
  zoneId: z.uuid().nullable().default(null),
  lat: lat.optional(),
  lon: lon.optional(),
})
// Device identity (deviceId/type/provider) and telemetry (battery/lastSeen) are not client-editable.
export const sensorPatch = z
  .object({ name, depthCm, zoneId: z.uuid().nullable(), lat: lat.nullable(), lon: lon.nullable() })
  .partial()
export const sensorAssign = z.object({ zoneId: z.uuid().nullable() })

export const manualReading = (now?: () => number) =>
  z.object({
    id: z.uuid().optional(),
    zoneId: z.uuid(),
    timestamp: timestamp(now),
    soilMoisturePercent: moisturePercent,
    soilTemperatureC: soilTempC.optional(),
    depthCm: depthCm.optional(),
    source: z.enum(['manual', 'csv']).default('manual'),
  })

export const irrigationEvent = (now?: () => number) =>
  z.object({
    id: z.uuid().optional(),
    zoneId: z.uuid(),
    timestamp: timestamp(now),
    mm: z.number().min(0).max(500),
    litres: z.number().min(0).max(1e9),
    note: z.string().max(500).optional(),
  })

export const fieldMapping = z
  .object({
    moisture: z.array(z.string().min(1).max(80)).max(10).optional(),
    temperature: z.array(z.string().min(1).max(80)).max(10).optional(),
    battery: z.array(z.string().min(1).max(80)).max(10).optional(),
    moistureScale: z.enum(['percent', 'fraction']).optional(),
  })
  .strict()

export const ttnConnect = z.object({
  // Cluster id of The Things Stack Cloud / TTN (eu1, nam1, au1, ...). Host is fixed server-side (no SSRF).
  cluster: z.string().trim().toLowerCase().regex(/^[a-z0-9]{2,10}$/, 'Cluster looks like eu1, nam1 or au1'),
  applicationId: z.string().trim().regex(/^[a-z0-9](?:-?[a-z0-9]){2,35}$/, 'Invalid application id'),
  apiKey: z.string().trim().min(16).max(512),
  fieldMapping: fieldMapping.optional(),
})
export const connectionPatch = z.object({ fieldMapping })

export const lorawanRegister = z.object({
  devices: z.array(z.object({ deviceId, name, depthCm: depthCm.default(15), zoneId: z.uuid().nullable().default(null) })).min(1).max(200),
})

export const esp32Claim = z.object({
  farmId: z.uuid(),
  claimCode: z.string().trim().min(8).max(32),
  name,
  depthCm: depthCm.default(15),
  zoneId: z.uuid().nullable().default(null),
})
export const esp32TokenRequest = z.object({ device_id: deviceId, factory_secret: z.string().min(16).max(200) })
export const esp32Reading = (now?: () => number) =>
  z.object({
    device_id: deviceId,
    timestamp: timestamp(now).optional(),
    soil_moisture_percent: moisturePercent,
    soil_temperature_c: soilTempC.optional(),
    battery_percent: batteryPercent.optional(),
    depth_cm: depthCm.optional(),
  })
export const adminDevice = z.object({ deviceId })
