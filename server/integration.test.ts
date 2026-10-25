// End-to-end API test against real Postgres SQL (PGlite in-process, exposed over the wire
// protocol so the production postgres.js client and db/001_init.sql are exercised unchanged).
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type Stripe from 'stripe'
import type { AuthUser } from './auth.js'
import type { Config } from './config.js'
import type { Deps } from './context.js'
import { HttpError } from './http.js'
import { createHandler } from './router.js'

const PORT = 55432 + Math.floor(Math.random() * 1000)
const USERS: Record<string, AuthUser> = {
  alice: { userId: '11111111-1111-4111-8111-111111111111', email: 'alice@example.com' },
  bob: { userId: '22222222-2222-4222-8222-222222222222', email: 'bob@example.com' },
}
const config: Config = {
  databaseUrl: `postgres://postgres@127.0.0.1:${PORT}/postgres?sslmode=disable`,
  encryptionKey: Buffer.alloc(32, 7),
  supabaseJwtSecret: 'unused',
  allowedOrigins: ['https://geoviva-tau.vercel.app'],
  publicApiUrl: 'https://api.example.test',
  adminToken: 'admin-token-for-tests-only',
  billing: {
    stripeSecretKey: 'sk_test_unused',
    webhookSecret: 'whsec_test',
    appUrl: 'https://geoviva-tau.vercel.app',
    prices: { growerMonthly: 'price_gm', growerYearly: 'price_gy', sensorMonthly: 'price_sm', sensorYearly: 'price_sy' },
  },
}

// Fake Stripe: signature "good" verifies; Checkout/Portal return URLs; subscriptions come from `stripeSubs`.
const stripeSubs = new Map<string, unknown>()
const fakeStripe = {
  webhooks: {
    constructEventAsync: async (payload: string, sig: string) => {
      if (sig !== 'good') throw new Error('bad signature')
      return JSON.parse(payload)
    },
  },
  subscriptions: { retrieve: async (id: string) => stripeSubs.get(id) },
  checkout: { sessions: { create: async () => ({ url: 'https://checkout.stripe.test/s' }) } },
  billingPortal: { sessions: { create: async () => ({ url: 'https://billing.stripe.test/p' }) } },
} as unknown as Stripe

// Fake The Things Stack: accepts key "NNSXS.GOOD...", lists two devices, accepts webhook creation.
const ttsCalls: string[] = []
const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  ttsCalls.push(`${init?.method ?? 'GET'} ${url}`)
  const auth = new Headers(init?.headers).get('authorization')
  if (auth !== 'Bearer NNSXS.GOOD-KEY-0123456789') return new Response('{}', { status: 401 })
  if (url.includes('/as/webhooks/')) return new Response('{}', { status: 200 })
  return Response.json({
    end_devices: [
      { ids: { device_id: 'soil-1' }, name: 'Soil 1', last_seen_at: '2026-10-22T10:00:00Z' },
      { ids: { device_id: 'soil-2' }, name: 'Soil 2' },
    ],
  })
}) as typeof fetch

let pg: PGlite
let server: PGLiteSocketServer
let sql: postgres.Sql
let now = Date.parse('2026-10-22T12:00:00Z')
let handle: (req: Request) => Promise<Response>

beforeAll(async () => {
  pg = await PGlite.create()
  await pg.exec(readFileSync(new URL('../db/001_init.sql', import.meta.url), 'utf8'))
  await pg.exec(readFileSync(new URL('../db/003_billing.sql', import.meta.url), 'utf8'))
  server = new PGLiteSocketServer({ db: pg, port: PORT, host: '127.0.0.1' })
  await server.start()
  sql = postgres(config.databaseUrl, { max: 1, prepare: false, ssl: false })
  const deps: Deps = {
    config,
    db: sql,
    verifyToken: async (t) => {
      const u = USERS[t]
      if (!u) throw new HttpError(401, 'invalid_token')
      return u
    },
    fetch: fakeFetch,
    now: () => now,
    stripe: fakeStripe,
  }
  handle = createHandler(() => deps)
}, 60_000)

afterAll(async () => {
  await sql?.end()
  await server?.stop()
  await pg?.close()
})

async function call(method: string, path: string, opts: { as?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...opts.headers }
  if (opts.as) headers.authorization = `Bearer ${opts.as}`
  const res = await handle(new Request(`https://geoviva-tau.vercel.app/api${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) }))
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers }
}

// ~100 m x 100 m square near Abbotsford, BC.
const square = { type: 'Polygon', coordinates: [[[-122.3, 49.05], [-122.2986, 49.05], [-122.2986, 49.0509], [-122.3, 49.0509], [-122.3, 49.05]]] }

describe('GeoViva API (Postgres)', () => {
  let farmId = ''
  let zoneId = ''
  let sensorId = ''

  it('requires auth and creates a farm owned by the caller', async () => {
    expect((await call('GET', '/farms')).status).toBe(401)
    const created = await call('POST', '/farms', { as: 'alice', body: { name: 'Fraser Valley Berries', location: 'Abbotsford, BC', lat: 49.05, lon: -122.3 } })
    expect(created.status).toBe(201)
    farmId = created.body.id
    const list = await call('GET', '/farms', { as: 'alice' })
    expect(list.body.farms).toHaveLength(1)
    expect(list.body.farms[0].role).toBe('owner')
  })

  it('creates a zone and recomputes its area server-side', async () => {
    const res = await call('POST', `/farms/${farmId}/zones`, {
      as: 'alice',
      body: { name: 'Blueberries north', cropId: 'blueberry', soilId: 'loam', method: 'drip', areaM2: 1, boundary: square },
    })
    expect(res.status).toBe(201)
    zoneId = res.body.id
    expect(res.body.areaM2).toBeGreaterThan(9000)
    expect(res.body.areaM2).toBeLessThan(11000)
    expect(res.body.boundary).toEqual(square)
    expect(res.body).not.toHaveProperty('notes') // nulls dropped
  })

  it('rejects a self-intersecting boundary', async () => {
    const bowtie = { type: 'Polygon', coordinates: [[[-122.3, 49.05], [-122.299, 49.051], [-122.299, 49.05], [-122.3, 49.051], [-122.3, 49.05]]] }
    const res = await call('POST', `/farms/${farmId}/zones`, { as: 'alice', body: { name: 'Bad', cropId: 'tomato', soilId: 'loam', method: 'drip', boundary: bowtie } })
    expect(res.status).toBe(400)
    expect(JSON.stringify(res.body.details)).toMatch(/crosses itself/)
  })

  it('patches a zone and keeps invariants', async () => {
    const res = await call('PATCH', `/farms/${farmId}/zones/${zoneId}`, { as: 'alice', body: { notes: 'Netted', efficiency: 0.9 } })
    expect(res.status).toBe(200)
    expect(res.body.notes).toBe('Netted')
    expect(res.body.areaM2).toBeGreaterThan(9000)
  })

  it('blocks cross-farm access', async () => {
    expect((await call('GET', `/farms/${farmId}/data`, { as: 'bob' })).status).toBe(404)
    expect((await call('PATCH', `/farms/${farmId}/zones/${zoneId}`, { as: 'bob', body: { name: 'x' } })).status).toBe(404)
    const bobFarm = await call('POST', '/farms', { as: 'bob', body: { name: 'Bob', lat: 49, lon: -122 } })
    // Bob cannot reference Alice's zone from his own farm.
    const s = await call('POST', `/farms/${bobFarm.body.id}/sensors`, { as: 'bob', body: { name: 'B1', deviceId: 'b-1', type: 'manual', zoneId } })
    expect(s.status).toBe(400)
    expect(s.body.error).toBe('zone_not_found')
    // Alice's zone id under Bob's farm path is not found.
    expect((await call('DELETE', `/farms/${bobFarm.body.id}/zones/${zoneId}`, { as: 'bob' })).status).toBe(404)
  })

  it('manual readings and irrigation events round-trip through FarmData', async () => {
    const r = await call('POST', `/farms/${farmId}/readings/manual`, {
      as: 'alice', body: { zoneId, timestamp: '2026-10-22T11:00:00Z', soilMoisturePercent: 24.5, soilTemperatureC: 14 },
    })
    expect(r.status).toBe(201)
    const future = await call('POST', `/farms/${farmId}/readings/manual`, { as: 'alice', body: { zoneId, timestamp: '2026-10-22T13:00:00Z', soilMoisturePercent: 20 } })
    expect(future.status).toBe(400)
    const e = await call('POST', `/farms/${farmId}/irrigation-events`, { as: 'alice', body: { zoneId, timestamp: '2026-10-22T06:00:00Z', mm: 10, litres: 1000 } })
    expect(e.status).toBe(201)
    const data = await call('GET', `/farms/${farmId}/data`, { as: 'alice' })
    expect(data.body.farm.name).toBe('Fraser Valley Berries')
    expect(data.body.zones).toHaveLength(1)
    expect(data.body.readings).toEqual([expect.objectContaining({ zoneId, sensorId: null, soilMoisturePercent: 24.5, source: 'manual' })])
    expect(data.body.events).toHaveLength(1)
  })

  it('connects The Things Stack, never returns the key, auto-creates the webhook', async () => {
    const bad = await call('POST', `/farms/${farmId}/lorawan/ttn/connect`, { as: 'alice', body: { cluster: 'eu1', applicationId: 'my-farm-app', apiKey: 'NNSXS.WRONG-KEY-000000' } })
    expect(bad.status).toBe(400)
    expect(bad.body.error).toBe('invalid_api_key')
    const res = await call('POST', `/farms/${farmId}/lorawan/ttn/connect`, { as: 'alice', body: { cluster: 'eu1', applicationId: 'my-farm-app', apiKey: 'NNSXS.GOOD-KEY-0123456789' } })
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('connected')
    expect(res.body.webhook.created).toBe(true)
    expect(res.body.webhook.url).toBe(`https://api.example.test/api/ingest/ttn/${res.body.id}`)
    expect(JSON.stringify(res.body)).not.toContain('GOOD-KEY')
    expect(ttsCalls.some((c) => c.startsWith('GET https://eu1.cloud.thethings.network/api/v3/applications/my-farm-app/devices'))).toBe(true)
    const [row] = await sql`select api_key_encrypted, webhook_secret_hash from lorawan_connections where id = ${res.body.id}`
    expect(row.api_key_encrypted).not.toContain('GOOD-KEY')
    expect(row.webhook_secret_hash).not.toBe(res.body.webhook.headerValue)
    const list = await call('GET', `/farms/${farmId}/lorawan/connections`, { as: 'alice' })
    expect(JSON.stringify(list.body)).not.toContain(res.body.webhook.headerValue)

    const connId = res.body.id
    const secret = res.body.webhook.headerValue
    const devices = await call('GET', `/farms/${farmId}/lorawan/${connId}/devices`, { as: 'alice' })
    expect(devices.body.devices.map((d: { deviceId: string; alreadyRegistered: boolean }) => [d.deviceId, d.alreadyRegistered])).toEqual([['soil-1', false], ['soil-2', false]])

    const reg = await call('POST', `/farms/${farmId}/lorawan/${connId}/register`, { as: 'alice', body: { devices: [{ deviceId: 'soil-1', name: 'TTN-001', depthCm: 20, zoneId }] } })
    expect(reg.status).toBe(201)
    sensorId = reg.body.sensors[0].id
    expect(reg.body.sensors[0]).toMatchObject({ type: 'lorawan', provider: 'ttn', zoneId, depthCm: 20 })
    // Re-registering updates in place.
    const again = await call('POST', `/farms/${farmId}/lorawan/${connId}/register`, { as: 'alice', body: { devices: [{ deviceId: 'soil-1', name: 'TTN-001b', depthCm: 25, zoneId }] } })
    expect(again.body.sensors[0].id).toBe(sensorId)

    const uplink = (deviceId: string, decoded: unknown, receivedAt = '2026-10-22T11:30:00Z') => ({
      end_device_ids: { device_id: deviceId, application_ids: { application_id: 'my-farm-app' } },
      received_at: receivedAt,
      uplink_message: { f_port: 2, decoded_payload: decoded, received_at: receivedAt },
    })
    const path = `/ingest/ttn/${connId}`
    expect((await call('POST', path, { body: uplink('soil-1', { soil_moisture: 30 }) })).status).toBe(401)
    expect((await call('POST', path, { body: uplink('soil-1', { soil_moisture: 30 }), headers: { 'x-geoviva-secret': 'wrong' } })).status).toBe(401)
    const ok = await call('POST', path, { body: uplink('soil-1', { water_SOIL: '31.5', temp_SOIL: '15.2', battery: 88 }), headers: { 'x-geoviva-secret': secret } })
    expect(ok.body).toEqual({ accepted: true })
    // Retry of the same uplink is idempotent.
    await call('POST', path, { body: uplink('soil-1', { water_SOIL: '31.5' }), headers: { 'x-geoviva-secret': secret } })
    const unknown = await call('POST', path, { body: uplink('ghost', { moisture: 20 }), headers: { 'x-geoviva-secret': secret } })
    expect(unknown).toMatchObject({ status: 202, body: { accepted: false, reason: 'unknown_device' } })
    const outOfRange = await call('POST', path, { body: uplink('soil-1', { moisture: 140 }, '2026-10-22T11:40:00Z'), headers: { 'x-geoviva-secret': secret } })
    expect(outOfRange.body.reason).toBe('moisture_out_of_range')

    const hist = await call('GET', `/farms/${farmId}/sensors/${sensorId}/readings?since=2026-10-01T00:00:00Z`, { as: 'alice' })
    expect(hist.body.readings).toEqual([expect.objectContaining({ soilMoisturePercent: 31.5, soilTemperatureC: 15.2, batteryPercent: 88, depthCm: 25, source: 'lorawan', zoneId })])
    const status = await call('GET', `/farms/${farmId}/sensors/status`, { as: 'alice' })
    expect(status.body.sensors[0]).toMatchObject({ id: sensorId, batteryPercent: 88, freshness: 'fresh', latestMoisturePercent: 31.5 })
    const logs = await sql`select reason from ingestion_log order by id`
    expect(logs.map((l) => l.reason)).toEqual(['bad_webhook_secret', 'bad_webhook_secret', 'unknown_device', 'moisture_out_of_range'])
  })

  it('assigns and unassigns sensors explicitly; deleting a zone unassigns', async () => {
    const un = await call('POST', `/farms/${farmId}/sensors/${sensorId}/assign`, { as: 'alice', body: { zoneId: null } })
    expect(un.body.zoneId).toBeNull()
    const re = await call('PATCH', `/farms/${farmId}/sensors/${sensorId}`, { as: 'alice', body: { zoneId } })
    expect(re.body.zoneId).toBe(zoneId)
  })

  it('Free has no zone or sensor cap, and the Season plan turns on from the signed Stripe webhook', async () => {
    const free = await call('GET', `/farms/${farmId}/billing`, { as: 'alice' })
    expect(free.body).toMatchObject({ plan: 'free', zones: null, assistant: false, textAlerts: false, usage: { sensors: 1 } })
    // Free farms can connect more sensors (rented or their own).
    const extra = await call('POST', `/farms/${farmId}/sensors`, { as: 'alice', body: { name: 'Probe 2', deviceId: 'probe-2', type: 'lorawan' } })
    expect(extra.status).toBe(201)
    expect((await call('POST', `/farms/${farmId}/sensors`, { as: 'alice', body: { name: 'Hand probe', deviceId: 'hand-1', type: 'manual' } })).status).toBe(201)

    expect((await call('POST', `/farms/${farmId}/billing/checkout`, { as: 'bob', body: { billing: 'monthly' } })).status).toBe(404)
    const checkout = await call('POST', `/farms/${farmId}/billing/checkout`, { as: 'alice', body: { billing: 'yearly', extraSensors: 1 } })
    expect(checkout).toMatchObject({ status: 201, body: { url: 'https://checkout.stripe.test/s' } })

    const sub = {
      id: 'sub_1', object: 'subscription', customer: 'cus_1', status: 'active', cancel_at_period_end: false, metadata: { farm_id: farmId },
      items: { data: [
        { price: { id: 'price_gy', recurring: { interval: 'year' } }, quantity: 1, current_period_end: 1_800_000_000 },
        { price: { id: 'price_sy', recurring: { interval: 'year' } }, quantity: 1, current_period_end: 1_800_000_000 },
      ] },
    }
    stripeSubs.set('sub_1', sub)
    const event = { id: 'evt_1', type: 'checkout.session.completed', data: { object: { mode: 'subscription', subscription: 'sub_1', client_reference_id: farmId } } }
    const hook = (body: unknown, sig = 'good') => handle(new Request('https://geoviva-tau.vercel.app/api/billing/webhook', {
      method: 'POST', headers: { 'stripe-signature': sig }, body: JSON.stringify(body),
    }))
    expect((await hook(event, 'forged')).status).toBe(400)
    expect((await hook(event)).status).toBe(200)
    expect((await hook(event)).status).toBe(200) // Stripe retry: applied once
    expect(await sql`select count(*)::int as n from stripe_events`).toEqual([{ n: 1 }])

    const paid = await call('GET', `/farms/${farmId}/billing`, { as: 'alice' })
    expect(paid.body).toMatchObject({ plan: 'grower', zones: null, assistant: true, textAlerts: true, cancelAtPeriodEnd: false })
    expect((await call('POST', `/farms/${farmId}/billing/checkout`, { as: 'alice', body: { billing: 'monthly' } })).status).toBe(409)
    expect((await call('POST', `/farms/${farmId}/billing/portal`, { as: 'alice' })).body.url).toBe('https://billing.stripe.test/p')

    // Cancelling in the portal keeps Grower until the period ends.
    const cancelled = { ...sub, cancel_at_period_end: true }
    expect((await hook({ id: 'evt_2', type: 'customer.subscription.updated', data: { object: cancelled } })).status).toBe(200)
    expect((await call('GET', `/farms/${farmId}/billing`, { as: 'alice' })).body).toMatchObject({ plan: 'grower', cancelAtPeriodEnd: true })
  })

  it('lets Free farms add as many zones as they like', async () => {
    const farm = await call('POST', '/farms', { as: 'bob', body: { name: 'Bob farm', location: '', lat: 49, lon: -122 } })
    const bobFarm = farm.body.id
    const zone = (name: string) => call('POST', `/farms/${bobFarm}/zones`, { as: 'bob', body: { name, cropId: 'lettuce', soilId: 'loam', method: 'drip', areaM2: 100 } })
    for (const n of ['A', 'B', 'C', 'D']) expect((await zone(n)).status).toBe(201)
    const data = await call('GET', `/farms/${bobFarm}/data`, { as: 'bob' })
    const last = data.body.zones[3].id
    expect((await call('POST', `/farms/${bobFarm}/readings/manual`, { as: 'bob', body: { zoneId: last, timestamp: '2026-10-22T11:00:00Z', soilMoisturePercent: 20 } })).status).toBe(201)
  })

  it('provisions, claims and ingests from an ESP32', async () => {
    expect((await call('POST', '/admin/devices', { body: { deviceId: 'esp32-0001' }, headers: { authorization: 'Bearer nope' } })).status).toBe(401)
    const prov = await call('POST', '/admin/devices', { body: { deviceId: 'esp32-0001' }, headers: { authorization: `Bearer ${config.adminToken}` } })
    expect(prov.status).toBe(201)
    const { claimCode, factorySecret } = prov.body

    const tokenBody = { device_id: 'esp32-0001', factory_secret: factorySecret }
    expect((await call('POST', '/ingest/esp32/token', { body: tokenBody })).status).toBe(409) // not claimed yet
    expect((await call('POST', '/ingest/esp32/token', { body: { ...tokenBody, factory_secret: 'x'.repeat(40) } })).status).toBe(401)

    expect((await call('POST', '/devices/claim', { as: 'bob', body: { farmId, claimCode, name: 'Wi-Fi 1' } })).status).toBe(404)
    const claim = await call('POST', '/devices/claim', { as: 'alice', body: { farmId, claimCode: claimCode.toLowerCase().replace(/-/g, ' '), name: 'Wi-Fi 1', depthCm: 15, zoneId } })
    expect(claim.status).toBe(201)
    expect(claim.body).toMatchObject({ deviceId: 'esp32-0001', ingestUrl: 'https://api.example.test/api/ingest/esp32', sensor: { type: 'esp32', zoneId } })
    expect((await call('POST', '/devices/claim', { as: 'alice', body: { farmId, claimCode, name: 'again' } })).status).toBe(404)

    const tok = await call('POST', '/ingest/esp32/token', { body: tokenBody })
    expect(tok.status).toBe(201)
    const token = tok.body.token
    const [claimRow] = await sql`select device_token_hash from device_claims where device_id = 'esp32-0001'`
    expect(claimRow.device_token_hash).not.toBe(token)

    const auth = { authorization: `Bearer ${token}` }
    expect((await call('POST', '/ingest/esp32', { body: { device_id: 'esp32-0001', soil_moisture_percent: 22 } })).status).toBe(401)
    expect((await call('POST', '/ingest/esp32', { body: { device_id: 'esp32-0001', soil_moisture_percent: 101 }, headers: auth })).status).toBe(400)
    expect((await call('POST', '/ingest/esp32', { body: { device_id: 'esp32-0001', soil_moisture_percent: 22, timestamp: '2026-10-22T12:10:00Z' }, headers: auth })).status).toBe(400)
    expect((await call('POST', '/ingest/esp32', { body: { device_id: 'esp32-9999', soil_moisture_percent: 22 }, headers: auth })).status).toBe(403)
    const ok = await call('POST', '/ingest/esp32', { body: { device_id: 'esp32-0001', soil_moisture_percent: 22.4, soil_temperature_c: 13.1, battery_percent: 77 }, headers: auth })
    expect(ok.status).toBe(201)
    expect((await call('POST', '/ingest/esp32', { body: { device_id: 'esp32-0001', soil_moisture_percent: 22 }, headers: auth })).status).toBe(429)

    // Removing the sensor releases the device: the token stops working.
    expect((await call('DELETE', `/farms/${farmId}/sensors/${claim.body.sensor.id}`, { as: 'alice' })).status).toBe(204)
    now += 120_000
    expect((await call('POST', '/ingest/esp32', { body: { device_id: 'esp32-0001', soil_moisture_percent: 22 }, headers: auth })).status).toBe(401)
  })

  it('deleting a zone keeps sensors and reading history but unassigns them', async () => {
    expect((await call('DELETE', `/farms/${farmId}/zones/${zoneId}`, { as: 'alice' })).status).toBe(204)
    const data = await call('GET', `/farms/${farmId}/data`, { as: 'alice' })
    expect(data.body.zones).toHaveLength(0)
    expect(data.body.sensors.find((s: { id: string }) => s.id === sensorId).zoneId).toBeNull()
    expect(data.body.events).toHaveLength(0)
    const [{ count }] = await sql`select count(*)::int as count from sensor_readings where farm_id = ${farmId}`
    expect(count).toBeGreaterThan(0)
  })

  it('answers CORS preflight only for the configured origin', async () => {
    const ok = await handle(new Request('https://x/api/farms', { method: 'OPTIONS', headers: { origin: 'https://geoviva-tau.vercel.app' } }))
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://geoviva-tau.vercel.app')
    const evil = await handle(new Request('https://x/api/farms', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }))
    expect(evil.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('routes via the vercel.json rewrite query parameter', async () => {
    const res = await handle(new Request(`https://x/api/router?path=farms`, { headers: { authorization: 'Bearer alice' } }))
    expect(res.status).toBe(200)
  })
})
