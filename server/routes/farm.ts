// Farms, zones, sensors, readings and irrigation events. Every handler: verify user ->
// requireMember(farm) -> queries filtered by farm_id.
import { randomUUID } from 'node:crypto'
import { requireMember } from '../auth.js'
import type { Ctx } from '../context.js'
import type { Db } from '../db.js'
import { assertCanAddSensors, assertCanAddZone, assertZoneWritable, planFor } from '../entitlements.js'
import { polygonAreaM2 } from '../geo.js'
import { HttpError, json, parse } from '../http.js'
import {
  farmCreate, farmPatch, irrigationEvent, manualReading, sensorAssign, sensorCreate, sensorPatch, zoneCreate, zonePatch,
} from '../schemas.js'

// Column lists aliased to the frontend shapes in src/types.ts (constant strings only).
export const FARM_COLS = 'id, name, location, lat, lon'
export const ZONE_COLS = `id, farm_id as "farmId", name, crop as "cropId", soil_type as "soilId", irrigation_method as "method",
  area_m2 as "areaM2", boundary, root_depth_mm as "rootDepthMm", efficiency, notes, created_at as "createdAt", updated_at as "updatedAt"`
export const SENSOR_COLS = `id, farm_id as "farmId", name, device_id as "deviceId", type, provider, depth_cm as "depthCm",
  zone_id as "zoneId", lat, lon, battery_percent as "batteryPercent", last_seen as "lastSeen", created_at as "createdAt"`
export const READING_COLS = `id, sensor_id as "sensorId", zone_id as "zoneId", timestamp, soil_moisture_percent as "soilMoisturePercent",
  soil_temperature_c as "soilTemperatureC", depth_cm as "depthCm", battery_percent as "batteryPercent", source`
export const EVENT_COLS = 'id, zone_id as "zoneId", timestamp, mm, litres, note, source'

// Nullable columns that the frontend models as optional fields: drop nulls instead of sending them.
const KEEP_NULL = new Set(['zoneId', 'sensorId', 'boundary'])
export function clean<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) if (v !== null || KEEP_NULL.has(k)) out[k] = v
  return out as T
}
const cleanAll = <T extends Record<string, unknown>>(rows: readonly T[]) => rows.map(clean)

export async function assertZone(db: Db, farmId: string, zoneId: string | null | undefined) {
  if (!zoneId) return
  const rows = await db`select 1 from zones where id = ${zoneId} and farm_id = ${farmId}`
  if (!rows.length) throw new HttpError(400, 'zone_not_found', 'That zone does not belong to this farm')
}

const DAY = 86_400_000
/** Start of a read window: ?since=, else defaultDays back, never further back than the plan's history. */
function sinceParam(ctx: Ctx, defaultDays: number, maxDays = 366): string {
  const raw = ctx.url.searchParams.get('since')
  const now = ctx.deps.now()
  const floor = now - maxDays * DAY
  if (!raw) return new Date(Math.max(now - defaultDays * DAY, floor)).toISOString()
  const t = Date.parse(raw)
  if (!Number.isFinite(t)) throw new HttpError(400, 'invalid_since', 'since must be an ISO timestamp')
  return new Date(Math.max(t, floor)).toISOString()
}

// ---------- farms ----------

export async function listFarms(ctx: Ctx) {
  const user = await ctx.user()
  const farms = await ctx.deps.db`
    select f.id, f.name, f.location, f.lat, f.lon, m.role
    from farms f join farm_members m on m.farm_id = f.id
    where m.user_id = ${user.userId} order by f.created_at`
  return json(200, { farms })
}

export async function createFarm(ctx: Ctx) {
  const user = await ctx.user()
  const input = parse(farmCreate, await ctx.body())
  const farm = await ctx.deps.db.begin(async (tx) => {
    await tx`insert into users (id, email) values (${user.userId}, ${user.email ?? null})
             on conflict (id) do update set email = coalesce(excluded.email, users.email)`
    const [f] = await tx`insert into farms ${tx(input, 'name', 'location', 'lat', 'lon')} returning ${tx.unsafe(FARM_COLS)}`
    await tx`insert into farm_members (farm_id, user_id, role) values (${f.id}, ${user.userId}, 'owner')`
    return f
  })
  return json(201, farm)
}

export async function patchFarm(ctx: Ctx) {
  const { db } = ctx.deps
  const farmId = ctx.params.farmId
  await requireMember(db, await ctx.user(), farmId, 'editor')
  const p = parse(farmPatch, await ctx.body())
  const cols = Object.keys(p) as (keyof typeof p)[]
  const [f] = cols.length
    ? await db`update farms set ${db(p, ...cols)}, updated_at = now() where id = ${farmId} returning ${db.unsafe(FARM_COLS)}`
    : await db`select ${db.unsafe(FARM_COLS)} from farms where id = ${farmId}`
  return json(200, f)
}

export async function getFarmData(ctx: Ctx) {
  const { db } = ctx.deps
  const farmId = ctx.params.farmId
  await requireMember(db, await ctx.user(), farmId, 'viewer')
  const { historyDays } = await planFor(db, farmId, ctx.deps.now())
  const since = sinceParam(ctx, 14, historyDays)
  const [farm] = await db`select ${db.unsafe(FARM_COLS)} from farms where id = ${farmId}`
  const [zones, sensors, readings, events] = await Promise.all([
    db`select ${db.unsafe(ZONE_COLS)} from zones where farm_id = ${farmId} order by created_at`,
    db`select ${db.unsafe(SENSOR_COLS)} from sensors where farm_id = ${farmId} order by created_at`,
    // ponytail: newest 20k readings in the window; page via /sensors/:id/readings for longer history.
    db`select * from (select ${db.unsafe(READING_COLS)} from sensor_readings
         where farm_id = ${farmId} and zone_id is not null and timestamp >= ${since}
         order by timestamp desc limit 20000) r order by timestamp`,
    db`select ${db.unsafe(EVENT_COLS)} from irrigation_events where farm_id = ${farmId} and timestamp >= ${sinceParam(ctx, 365, historyDays)} order by timestamp`,
  ])
  return json(200, { farm, zones: cleanAll(zones), sensors: cleanAll(sensors), readings: cleanAll(readings), events: cleanAll(events) })
}

// ---------- zones ----------

function zoneRow(z: ReturnType<typeof zoneCreate.parse>) {
  return {
    name: z.name,
    crop: z.cropId,
    soil_type: z.soilId,
    irrigation_method: z.method,
    // Area always comes from the server when a boundary exists; client areaM2 only for legacy zones.
    area_m2: z.boundary ? Math.round(polygonAreaM2(z.boundary) * 10) / 10 : z.areaM2!,
    boundary: z.boundary ?? null,
    root_depth_mm: z.rootDepthMm ?? null,
    efficiency: z.efficiency ?? null,
    notes: z.notes ?? null,
  }
}

export async function createZone(ctx: Ctx) {
  const { db } = ctx.deps
  const farmId = ctx.params.farmId
  await requireMember(db, await ctx.user(), farmId, 'editor')
  const z = parse(zoneCreate, await ctx.body())
  await assertCanAddZone(db, farmId, ctx.deps.now())
  const row = { id: z.id ?? randomUUID(), farm_id: farmId, ...zoneRow(z), boundary: z.boundary ? db.json(z.boundary) : null }
  const [out] = await db`insert into zones ${db(row)} returning ${db.unsafe(ZONE_COLS)}`
  return json(201, clean(out))
}

export async function patchZone(ctx: Ctx) {
  const { db } = ctx.deps
  const { farmId, zoneId } = ctx.params
  await requireMember(db, await ctx.user(), farmId, 'editor')
  const patch = parse(zonePatch, await ctx.body())
  await assertZoneWritable(db, farmId, zoneId, ctx.deps.now())
  const [existing] = await db`select ${db.unsafe(ZONE_COLS)} from zones where id = ${zoneId} and farm_id = ${farmId}`
  if (!existing) throw new HttpError(404, 'zone_not_found')
  // Re-validate the merged zone so invariants (boundary or area) hold after partial updates.
  const merged = parse(zoneCreate, { ...clean(existing), id: undefined, ...patch })
  const row = zoneRow(merged)
  const [out] = await db`update zones set ${db({ ...row, boundary: row.boundary ? db.json(row.boundary) : null })}, updated_at = now()
    where id = ${zoneId} and farm_id = ${farmId} returning ${db.unsafe(ZONE_COLS)}`
  return json(200, clean(out))
}

export async function deleteZone(ctx: Ctx) {
  const { db } = ctx.deps
  const { farmId, zoneId } = ctx.params
  await requireMember(db, await ctx.user(), farmId, 'editor')
  // FKs: sensors and readings become unassigned (history kept), irrigation events are removed.
  const rows = await db`delete from zones where id = ${zoneId} and farm_id = ${farmId} returning id`
  if (!rows.length) throw new HttpError(404, 'zone_not_found')
  return json(204, null)
}

// ---------- sensors ----------

export async function createSensor(ctx: Ctx) {
  const { db } = ctx.deps
  const farmId = ctx.params.farmId
  await requireMember(db, await ctx.user(), farmId, 'editor')
  const s = parse(sensorCreate, await ctx.body())
  await assertZone(db, farmId, s.zoneId)
  if (s.type !== 'manual') await assertCanAddSensors(db, farmId, ctx.deps.now())
  const row = {
    id: s.id ?? randomUUID(), farm_id: farmId, name: s.name, device_id: s.deviceId, type: s.type,
    provider: s.type === 'lorawan' ? (s.provider ?? 'ttn') : null, depth_cm: s.depthCm, zone_id: s.zoneId,
    lat: s.lat ?? null, lon: s.lon ?? null,
  }
  const [out] = await db`insert into sensors ${db(row)} returning ${db.unsafe(SENSOR_COLS)}`
  return json(201, clean(out))
}

export async function patchSensor(ctx: Ctx) {
  const { db } = ctx.deps
  const { farmId, sensorId } = ctx.params
  await requireMember(db, await ctx.user(), farmId, 'editor')
  const p = parse(sensorPatch, await ctx.body())
  await assertZone(db, farmId, p.zoneId)
  const row: Record<string, unknown> = {}
  if (p.name !== undefined) row.name = p.name
  if (p.depthCm !== undefined) row.depth_cm = p.depthCm
  if (p.zoneId !== undefined) row.zone_id = p.zoneId
  if (p.lat !== undefined) row.lat = p.lat
  if (p.lon !== undefined) row.lon = p.lon
  const [out] = Object.keys(row).length
    ? await db`update sensors set ${db(row)} where id = ${sensorId} and farm_id = ${farmId} returning ${db.unsafe(SENSOR_COLS)}`
    : await db`select ${db.unsafe(SENSOR_COLS)} from sensors where id = ${sensorId} and farm_id = ${farmId}`
  if (!out) throw new HttpError(404, 'sensor_not_found')
  return json(200, clean(out))
}

/** Explicit sensor -> zone assignment (null = unassigned). Never inferred from geometry. */
export async function assignSensor(ctx: Ctx) {
  const { db } = ctx.deps
  const { farmId, sensorId } = ctx.params
  await requireMember(db, await ctx.user(), farmId, 'editor')
  const { zoneId } = parse(sensorAssign, await ctx.body())
  await assertZone(db, farmId, zoneId)
  const [out] = await db`update sensors set zone_id = ${zoneId} where id = ${sensorId} and farm_id = ${farmId} returning ${db.unsafe(SENSOR_COLS)}`
  if (!out) throw new HttpError(404, 'sensor_not_found')
  return json(200, clean(out))
}

export async function deleteSensor(ctx: Ctx) {
  const { db } = ctx.deps
  const { farmId, sensorId } = ctx.params
  await requireMember(db, await ctx.user(), farmId, 'editor')
  const rows = await db.begin(async (tx) => {
    // An ESP32 removed from the farm is released: its token stops working and it can be claimed again.
    await tx`update device_claims set farm_id = null, sensor_id = null, device_token_hash = null, claimed_at = null, token_issued_at = null
             where sensor_id = ${sensorId} and farm_id = ${farmId}`
    return tx`delete from sensors where id = ${sensorId} and farm_id = ${farmId} returning id`
  })
  if (!rows.length) throw new HttpError(404, 'sensor_not_found')
  return json(204, null)
}

export async function sensorReadings(ctx: Ctx) {
  const { db } = ctx.deps
  const { farmId, sensorId } = ctx.params
  await requireMember(db, await ctx.user(), farmId, 'viewer')
  const [s] = await db`select id from sensors where id = ${sensorId} and farm_id = ${farmId}`
  if (!s) throw new HttpError(404, 'sensor_not_found')
  const { historyDays } = await planFor(db, farmId, ctx.deps.now())
  const readings = await db`select ${db.unsafe(READING_COLS)} from sensor_readings
    where sensor_id = ${sensorId} and farm_id = ${farmId} and timestamp >= ${sinceParam(ctx, 30, historyDays)}
    order by timestamp limit 10000`
  return json(200, { readings: cleanAll(readings) })
}

const H = 3_600_000
export async function sensorStatus(ctx: Ctx) {
  const { db } = ctx.deps
  const farmId = ctx.params.farmId
  await requireMember(db, await ctx.user(), farmId, 'viewer')
  const rows = await db`
    select s.*, r.timestamp as "latestAt", r.soil_moisture_percent as "latestMoisturePercent"
    from (select ${db.unsafe(SENSOR_COLS)} from sensors where farm_id = ${farmId}) s
    left join lateral (select timestamp, soil_moisture_percent from sensor_readings
                       where sensor_id = s.id order by timestamp desc limit 1) r on true
    order by s."createdAt"`
  const now = ctx.deps.now()
  const sensors = rows.map((r) => {
    const last = r.lastSeen ?? r.latestAt
    const age = last ? now - new Date(last).getTime() : Infinity
    const [fresh, stale] = r.type === 'manual' ? [24 * H, 72 * H] : [3 * H, 24 * H] // matches src/state/farmStore.tsx
    return { ...clean(r), freshness: age <= fresh ? 'fresh' : age <= stale ? 'stale' : 'missing' }
  })
  return json(200, { sensors })
}

// ---------- readings & events ----------

export async function addManualReading(ctx: Ctx) {
  const { db } = ctx.deps
  const farmId = ctx.params.farmId
  await requireMember(db, await ctx.user(), farmId, 'editor')
  const r = parse(manualReading(ctx.deps.now), await ctx.body())
  await assertZone(db, farmId, r.zoneId)
  await assertZoneWritable(db, farmId, r.zoneId, ctx.deps.now())
  const row = {
    id: r.id ?? randomUUID(), farm_id: farmId, sensor_id: null, zone_id: r.zoneId, timestamp: r.timestamp,
    soil_moisture_percent: r.soilMoisturePercent, soil_temperature_c: r.soilTemperatureC ?? null, depth_cm: r.depthCm ?? null, source: r.source,
  }
  const [out] = await db`insert into sensor_readings ${db(row)} returning ${db.unsafe(READING_COLS)}`
  return json(201, clean(out))
}

export async function addIrrigationEvent(ctx: Ctx) {
  const { db } = ctx.deps
  const farmId = ctx.params.farmId
  await requireMember(db, await ctx.user(), farmId, 'editor')
  const e = parse(irrigationEvent(ctx.deps.now), await ctx.body())
  await assertZone(db, farmId, e.zoneId)
  await assertZoneWritable(db, farmId, e.zoneId, ctx.deps.now())
  const row = { id: e.id ?? randomUUID(), farm_id: farmId, zone_id: e.zoneId, timestamp: e.timestamp, mm: e.mm, litres: e.litres, note: e.note ?? null, source: 'manual' }
  const [out] = await db`insert into irrigation_events ${db(row)} returning ${db.unsafe(EVENT_COLS)}`
  return json(201, clean(out))
}
