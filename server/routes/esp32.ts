// ESP32 Wi-Fi sensors.
// Factory: POST /api/admin/devices creates a device_claims row and returns (once) the claim code for
//   the label and the factory secret to flash. Farmer: POST /api/devices/claim with the label code binds
//   the device to a farm. Device: POST /api/ingest/esp32/token (device_id + factory secret) gets a device
//   token, then POST /api/ingest/esp32 with "Authorization: Bearer <token>" every 15 minutes.
import { randomUUID } from 'node:crypto'
import { requireMember } from '../auth.js'
import type { Ctx } from '../context.js'
import { hashSecret, newClaimCode, normalizeClaimCode, randomToken, safeEqual, verifySecret } from '../crypto.js'
import { logIngest } from '../db.js'
import { assertCanAddSensors, sensorAccepting } from '../entitlements.js'
import { bearer, HttpError, json, parse, readJson } from '../http.js'
import { adminDevice, esp32Claim, esp32Reading, esp32TokenRequest } from '../schemas.js'
import { assertZone, clean, SENSOR_COLS } from './farm.js'

/** Minimum seconds between accepted readings per device (firmware posts every 15 min). */
export const MIN_INGEST_INTERVAL_S = 60
const MIN_TOKEN_INTERVAL_S = 60

export async function provisionDevice(ctx: Ctx) {
  const { db, config } = ctx.deps
  const token = bearer(ctx.req)
  if (!config.adminToken || !token || !safeEqual(token, config.adminToken)) throw new HttpError(401, 'unauthorized')
  const { deviceId } = parse(adminDevice, await ctx.body())
  const claimCode = newClaimCode()
  const factorySecret = randomToken()
  await db`insert into device_claims ${db({
    id: randomUUID(), device_id: deviceId,
    claim_code_hash: hashSecret(normalizeClaimCode(claimCode), config.encryptionKey),
    factory_secret_hash: hashSecret(factorySecret, config.encryptionKey),
  })}`
  // Shown once: print claimCode on the label, flash factorySecret into the firmware (secrets.h).
  return json(201, { deviceId, claimCode, factorySecret })
}

export async function claimDevice(ctx: Ctx) {
  const { db, config } = ctx.deps
  const input = parse(esp32Claim, await ctx.body())
  await requireMember(db, await ctx.user(), input.farmId, 'editor')
  await assertZone(db, input.farmId, input.zoneId)
  await assertCanAddSensors(db, input.farmId, ctx.deps.now())
  const hash = hashSecret(normalizeClaimCode(input.claimCode), config.encryptionKey)
  const sensor = await db.begin(async (tx) => {
    // Atomic: only an unclaimed code can be claimed. Same 404 for unknown and already-claimed codes.
    const [claim] = await tx<{ id: string; device_id: string }[]>`
      update device_claims set farm_id = ${input.farmId}, claimed_at = now()
      where claim_code_hash = ${hash} and farm_id is null returning id, device_id`
    if (!claim) throw new HttpError(404, 'invalid_claim_code', 'That code is not valid or the device is already claimed')
    const [s] = await tx`insert into sensors ${tx({
      id: randomUUID(), farm_id: input.farmId, name: input.name, device_id: claim.device_id, type: 'esp32',
      provider: null, depth_cm: input.depthCm, zone_id: input.zoneId,
    })} returning ${tx.unsafe(SENSOR_COLS)}`
    await tx`update device_claims set sensor_id = ${s.id} where id = ${claim.id}`
    return s
  })
  return json(201, { deviceId: sensor.deviceId, sensor: clean(sensor), ingestUrl: `${ctx.baseUrl}/api/ingest/esp32` })
}

/** Device exchanges its factory secret for a device token once it has been claimed. Re-calling rotates the token. */
export async function issueDeviceToken(ctx: Ctx) {
  const { db, config } = ctx.deps
  const input = parse(esp32TokenRequest, await readJson(ctx.req))
  const [c] = await db<{ id: string; farm_id: string | null; sensor_id: string | null; factory_secret_hash: string; token_issued_at: Date | null }[]>`
    select id, farm_id, sensor_id, factory_secret_hash, token_issued_at from device_claims where device_id = ${input.device_id}`
  if (!c || !verifySecret(input.factory_secret, c.factory_secret_hash, config.encryptionKey)) {
    // Never log the submitted secret.
    await logIngest(db, { source: 'esp32', reason: 'bad_factory_secret', deviceId: input.device_id })
    throw new HttpError(401, 'unauthorized')
  }
  if (!c.farm_id || !c.sensor_id) throw new HttpError(409, 'not_claimed', 'Claim this device in the GeoViva app first')
  const token = randomToken()
  const rows = await db`update device_claims set device_token_hash = ${hashSecret(token, config.encryptionKey)}, token_issued_at = now()
    where id = ${c.id} and (token_issued_at is null or token_issued_at < now() - make_interval(secs => ${MIN_TOKEN_INTERVAL_S}))
    returning id`
  if (!rows.length) throw new HttpError(429, 'rate_limited', 'Token requested too recently')
  return json(201, { token, ingestUrl: `${ctx.baseUrl}/api/ingest/esp32` })
}

export async function ingestEsp32(ctx: Ctx) {
  const { db, config } = ctx.deps
  const token = bearer(ctx.req)
  if (!token) throw new HttpError(401, 'unauthorized')
  // Lookup by keyed hash: the DB compares HMACs, never the token itself.
  const [c] = await db<{ id: string; device_id: string; farm_id: string; sensor_id: string }[]>`
    select id, device_id, farm_id, sensor_id from device_claims
    where device_token_hash = ${hashSecret(token, config.encryptionKey)} and farm_id is not null and sensor_id is not null`
  if (!c) throw new HttpError(401, 'unauthorized')

  const body = await readJson(ctx.req)
  const r = esp32Reading(ctx.deps.now).safeParse(body)
  if (!r.success) {
    const reason = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ').slice(0, 300)
    await logIngest(db, { source: 'esp32', reason: `invalid_payload: ${reason}`, deviceId: c.device_id, farmId: c.farm_id, payload: body })
    throw new HttpError(400, 'invalid_request', reason)
  }
  if (r.data.device_id !== c.device_id) {
    await logIngest(db, { source: 'esp32', reason: 'device_id_mismatch', deviceId: c.device_id, farmId: c.farm_id })
    throw new HttpError(403, 'device_mismatch')
  }
  // Atomic per-device rate limit window stored on the claim row.
  const ok = await db`update device_claims set last_ingest_at = now()
    where id = ${c.id} and (last_ingest_at is null or last_ingest_at < now() - make_interval(secs => ${MIN_INGEST_INTERVAL_S})) returning id`
  if (!ok.length) throw new HttpError(429, 'rate_limited', `At most one reading per ${MIN_INGEST_INTERVAL_S} s`)

  const [s] = await db<{ id: string; zone_id: string | null; depth_cm: number }[]>`
    select id, zone_id, depth_cm from sensors where id = ${c.sensor_id} and farm_id = ${c.farm_id}`
  if (!s) throw new HttpError(409, 'not_registered')
  if (!(await sensorAccepting(db, c.farm_id, s.id, ctx.deps.now()))) {
    await logIngest(db, { source: 'esp32', reason: 'plan_limit', deviceId: c.device_id, farmId: c.farm_id })
    throw new HttpError(402, 'plan_limit', 'This sensor is over the farm’s plan limit')
  }
  const ts = r.data.timestamp ?? new Date(ctx.deps.now()).toISOString()
  await db`insert into sensor_readings ${db({
    id: randomUUID(), farm_id: c.farm_id, sensor_id: s.id, zone_id: s.zone_id, timestamp: ts,
    soil_moisture_percent: r.data.soil_moisture_percent, soil_temperature_c: r.data.soil_temperature_c ?? null,
    depth_cm: r.data.depth_cm ?? s.depth_cm, battery_percent: r.data.battery_percent ?? null, source: 'esp32',
  })} on conflict (sensor_id, timestamp) do nothing`
  await db`update sensors set last_seen = greatest(coalesce(last_seen, ${ts}), ${ts}),
    battery_percent = coalesce(${r.data.battery_percent ?? null}, battery_percent) where id = ${s.id}`
  return json(201, { accepted: true, nextInSeconds: 900 })
}
