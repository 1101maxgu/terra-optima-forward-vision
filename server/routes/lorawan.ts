// LoRaWAN connections (farmer-facing) and the TTS webhook ingest endpoint.
import { randomUUID } from 'node:crypto'
import { requireMember } from '../auth.js'
import type { Ctx } from '../context.js'
import { decrypt, encrypt, hashSecret, randomToken, verifySecret } from '../crypto.js'
import { logIngest, type Db } from '../db.js'
import { assertCanAddSensors, sensorAccepting } from '../entitlements.js'
import { bearer, HttpError, json, parse, readJson } from '../http.js'
import { PROVIDERS, ProviderError, ttn, type FieldMapping, type ProviderConnection, type ProviderId } from '../providers/lorawan.js'
import { connectionPatch, lorawanRegister, ttnConnect } from '../schemas.js'
import { assertZone, clean, SENSOR_COLS } from './farm.js'

export const WEBHOOK_HEADER = 'X-GeoViva-Secret'

interface ConnRow {
  id: string
  farm_id: string
  provider: ProviderId
  cluster: string | null
  application_id: string
  api_key_encrypted: string
  webhook_secret_hash: string
  field_mapping: FieldMapping
  status: 'connected' | 'error'
  last_synced_at: Date | null
  last_error: string | null
}

/** Public shape (src/services/deviceApi.ts LorawanConnection). Never includes the key or secret. */
function toConnection(c: ConnRow) {
  const label = c.provider === 'ttn' ? `The Things Stack — ${c.cluster} / ${c.application_id}` : `ChirpStack — ${c.application_id}`
  return clean({
    id: c.id,
    provider: c.provider,
    label,
    status: c.status,
    lastSyncedAt: c.last_synced_at ? c.last_synced_at.toISOString() : null,
    error: c.last_error,
    fieldMapping: c.field_mapping,
  })
}

const providerFail = (e: unknown): never => {
  if (e instanceof ProviderError)
    throw new HttpError(e.code === 'provider_unreachable' ? 502 : e.code === 'not_implemented' ? 501 : 400, e.code, e.message)
  throw e
}

async function loadConnection(db: Db, farmId: string, connectionId: string): Promise<ConnRow> {
  const [c] = await db<ConnRow[]>`select * from lorawan_connections where id = ${connectionId} and farm_id = ${farmId}`
  if (!c) throw new HttpError(404, 'connection_not_found')
  return c
}

const providerConn = (c: ConnRow, key: Buffer): ProviderConnection => ({
  cluster: c.cluster,
  applicationId: c.application_id,
  apiKey: decrypt(c.api_key_encrypted, key),
})

export async function connectTtn(ctx: Ctx) {
  const { db, config } = ctx.deps
  const farmId = ctx.params.farmId
  await requireMember(db, await ctx.user(), farmId, 'editor')
  const input = parse(ttnConnect, await ctx.body())
  const conn: ProviderConnection = { cluster: input.cluster, applicationId: input.applicationId, apiKey: input.apiKey }
  await ttn.verify(conn, ctx.deps.fetch).catch(providerFail)

  // Reconnecting the same application rotates the API key and webhook secret.
  const secret = randomToken()
  const [row] = await db<ConnRow[]>`
    insert into lorawan_connections ${db({
      id: randomUUID(), farm_id: farmId, provider: 'ttn', cluster: input.cluster, application_id: input.applicationId,
      api_key_encrypted: encrypt(input.apiKey, config.encryptionKey), webhook_secret_hash: hashSecret(secret, config.encryptionKey),
      field_mapping: db.json((input.fieldMapping ?? {}) as Record<string, never>), status: 'connected',
    })}
    on conflict (farm_id, provider, cluster, application_id) do update set
      api_key_encrypted = excluded.api_key_encrypted, webhook_secret_hash = excluded.webhook_secret_hash,
      status = 'connected', last_error = null, last_synced_at = now()
    returning *`

  const url = `${ctx.baseUrl}/api/ingest/ttn/${row.id}`
  const created = await ttn.createWebhook(conn, { id: `geoviva-${row.id.slice(0, 8)}`, url, headers: { [WEBHOOK_HEADER]: secret } }, ctx.deps.fetch)
  await db`update lorawan_connections set webhook_created = ${created}, last_synced_at = now() where id = ${row.id}`
  // The secret is shown exactly once so the farmer can paste it into TTS if auto-creation failed.
  return json(201, {
    ...toConnection({ ...row, last_synced_at: new Date(ctx.deps.now()) }),
    webhook: { created, url, format: 'json', headerName: WEBHOOK_HEADER, headerValue: secret, enabledMessages: ['uplink_message'] },
  })
}

export async function listConnections(ctx: Ctx) {
  const { db } = ctx.deps
  const farmId = ctx.params.farmId
  await requireMember(db, await ctx.user(), farmId, 'viewer')
  const rows = await db<ConnRow[]>`select * from lorawan_connections where farm_id = ${farmId} order by created_at`
  return json(200, { connections: rows.map(toConnection) })
}

export async function patchConnection(ctx: Ctx) {
  const { db } = ctx.deps
  const { farmId, connectionId } = ctx.params
  await requireMember(db, await ctx.user(), farmId, 'editor')
  const { fieldMapping } = parse(connectionPatch, await ctx.body())
  const [row] = await db<ConnRow[]>`update lorawan_connections set field_mapping = ${db.json(fieldMapping as Record<string, never>)}
    where id = ${connectionId} and farm_id = ${farmId} returning *`
  if (!row) throw new HttpError(404, 'connection_not_found')
  return json(200, toConnection(row))
}

export async function listRemoteDevices(ctx: Ctx) {
  const { db, config } = ctx.deps
  const { farmId, connectionId } = ctx.params
  await requireMember(db, await ctx.user(), farmId, 'viewer')
  const c = await loadConnection(db, farmId, connectionId)
  let remote
  try {
    remote = await PROVIDERS[c.provider].listDevices(providerConn(c, config.encryptionKey), ctx.deps.fetch)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error'
    await db`update lorawan_connections set status = 'error', last_error = ${msg.slice(0, 300)} where id = ${c.id}`
    return providerFail(e)
  }
  await db`update lorawan_connections set status = 'connected', last_error = null, last_synced_at = now() where id = ${c.id}`
  const registered = await db<{ deviceId: string; depthCm: number; batteryPercent: number | null; lastMoisturePercent: number | null }[]>`
    select s.device_id as "deviceId", s.depth_cm as "depthCm", s.battery_percent as "batteryPercent", r.soil_moisture_percent as "lastMoisturePercent"
    from sensors s left join lateral (select soil_moisture_percent from sensor_readings where sensor_id = s.id order by timestamp desc limit 1) r on true
    where s.farm_id = ${farmId} and s.connection_id = ${c.id}`
  const byId = new Map(registered.map((r) => [r.deviceId, r]))
  const devices = remote.map((d) => {
    const reg = byId.get(d.deviceId)
    return clean({
      deviceId: d.deviceId, name: d.name, lastSeen: d.lastSeen ?? null, alreadyRegistered: Boolean(reg),
      depthCm: reg?.depthCm ?? null, batteryPercent: reg?.batteryPercent ?? null, lastMoisturePercent: reg?.lastMoisturePercent ?? null,
    })
  })
  return json(200, { devices })
}

export async function registerDevices(ctx: Ctx) {
  const { db } = ctx.deps
  const { farmId, connectionId } = ctx.params
  await requireMember(db, await ctx.user(), farmId, 'editor')
  const c = await loadConnection(db, farmId, connectionId)
  const { devices } = parse(lorawanRegister, await ctx.body())
  for (const z of new Set(devices.map((d) => d.zoneId))) await assertZone(db, farmId, z)
  const known = await db<{ device_id: string }[]>`select device_id from sensors where farm_id = ${farmId} and connection_id = ${c.id}`
  const added = new Set(devices.map((d) => d.deviceId).filter((id) => !known.some((k) => k.device_id === id))).size
  if (added) await assertCanAddSensors(db, farmId, ctx.deps.now(), added)
  const rows = devices.map((d) => ({
    id: randomUUID(), farm_id: farmId, connection_id: c.id, name: d.name, device_id: d.deviceId, type: 'lorawan', provider: c.provider,
    depth_cm: d.depthCm, zone_id: d.zoneId,
  }))
  // Re-registering an existing device updates its name/depth/zone instead of duplicating it.
  const out = await db`insert into sensors ${db(rows)}
    on conflict (farm_id, type, connection_id, device_id) do update set name = excluded.name, depth_cm = excluded.depth_cm, zone_id = excluded.zone_id
    returning ${db.unsafe(SENSOR_COLS)}`
  return json(201, { sensors: out.map(clean) })
}

/** TTS webhook target. Authenticated by the per-connection secret header (HMAC compare). */
export async function ingestTtn(ctx: Ctx) {
  const { db, config } = ctx.deps
  const connectionId = ctx.params.connectionId
  const [c] = await db<ConnRow[]>`select * from lorawan_connections where id = ${connectionId}`
  const secret = ctx.req.headers.get(WEBHOOK_HEADER) ?? bearer(ctx.req)
  if (!c || !secret || !verifySecret(secret, c.webhook_secret_hash, config.encryptionKey)) {
    if (c) await logIngest(db, { source: c.provider, reason: 'bad_webhook_secret', connectionId: c.id, farmId: c.farm_id })
    throw new HttpError(401, 'unauthorized')
  }
  const body = await readJson(ctx.req)
  const up = PROVIDERS[c.provider].parseUplink(body, c.field_mapping ?? {}, ctx.deps.now())
  // Data problems answer 202 so the network server does not mark the webhook unhealthy and retry forever.
  if (!up.ok) {
    if (!up.ignore) await logIngest(db, { source: c.provider, reason: up.reason, connectionId: c.id, farmId: c.farm_id, deviceId: up.deviceId, payload: body })
    return json(202, { accepted: false, reason: up.reason })
  }
  const [s] = await db<{ id: string; zone_id: string | null; depth_cm: number }[]>`
    select id, zone_id, depth_cm from sensors where farm_id = ${c.farm_id} and connection_id = ${c.id} and device_id = ${up.deviceId}`
  if (!s) {
    await logIngest(db, { source: c.provider, reason: 'unknown_device', connectionId: c.id, farmId: c.farm_id, deviceId: up.deviceId })
    return json(202, { accepted: false, reason: 'unknown_device' })
  }
  if (!(await sensorAccepting(db, c.farm_id, s.id, ctx.deps.now()))) {
    await logIngest(db, { source: c.provider, reason: 'plan_limit', connectionId: c.id, farmId: c.farm_id, deviceId: up.deviceId })
    return json(202, { accepted: false, reason: 'plan_limit' })
  }
  await db`insert into sensor_readings ${db({
    id: randomUUID(), farm_id: c.farm_id, sensor_id: s.id, zone_id: s.zone_id, timestamp: up.timestamp,
    soil_moisture_percent: up.soilMoisturePercent, soil_temperature_c: up.soilTemperatureC ?? null, depth_cm: s.depth_cm,
    battery_percent: up.batteryPercent ?? null, source: 'lorawan',
  })} on conflict (sensor_id, timestamp) do nothing`
  await db`update sensors set last_seen = greatest(coalesce(last_seen, ${up.timestamp}), ${up.timestamp}),
    battery_percent = coalesce(${up.batteryPercent ?? null}, battery_percent) where id = ${s.id}`
  await db`update lorawan_connections set last_synced_at = now(), status = 'connected', last_error = null where id = ${c.id}`
  return json(200, { accepted: true })
}
