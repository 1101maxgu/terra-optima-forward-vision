import { describe, expect, it, vi } from 'vitest'
import { requireMember } from './auth.js'
import { loadConfig } from './config.js'
import { decrypt, encrypt, hashSecret, newClaimCode, normalizeClaimCode, safeEqual, verifySecret } from './crypto.js'
import type { Db } from './db.js'
import { polygonAreaM2, polygonProblem } from './geo.js'
import { HttpError } from './http.js'
import { normalizeDecoded, ttn } from './providers/lorawan.js'
import { createHandler, defaultDeps, match } from './router.js'
import { esp32Reading, farmCreate, sensorPatch, ttnConnect, zoneCreate } from './schemas.js'

const KEY = Buffer.alloc(32, 1)
const NOW = Date.parse('2026-10-22T12:00:00Z')
const square = { type: 'Polygon' as const, coordinates: [[[-122.3, 49.05], [-122.2986, 49.05], [-122.2986, 49.0509], [-122.3, 49.0509], [-122.3, 49.05]]] as [number, number][][] }

describe('polygon validation', () => {
  it('accepts a valid square and computes ~1 ha', () => {
    expect(polygonProblem(square)).toBeNull()
    expect(polygonAreaM2(square)).toBeGreaterThan(9000)
    expect(polygonAreaM2(square)).toBeLessThan(11000)
  })
  it('rejects open rings, too few positions, bad ranges, self-intersection and tiny areas', () => {
    const ring = square.coordinates[0]
    expect(polygonProblem({ type: 'Polygon', coordinates: [ring.slice(0, -1)] })).toMatch(/not closed/)
    expect(polygonProblem({ type: 'Polygon', coordinates: [[ring[0], ring[1], ring[0]]] })).toMatch(/at least 4/)
    expect(polygonProblem({ type: 'Polygon', coordinates: [[[200, 49], [-122.29, 49.05], [-122.29, 49.06], [200, 49]]] })).toMatch(/ranges/)
    const bowtie: [number, number][] = [[-122.3, 49.05], [-122.299, 49.051], [-122.299, 49.05], [-122.3, 49.051], [-122.3, 49.05]]
    expect(polygonProblem({ type: 'Polygon', coordinates: [bowtie] })).toMatch(/crosses itself/)
    const tiny: [number, number][] = [[0, 0], [0.00001, 0], [0.00001, 0.00001], [0, 0]]
    expect(polygonProblem({ type: 'Polygon', coordinates: [tiny] })).toMatch(/too small/)
  })
})

describe('zod schemas', () => {
  it('zone needs boundary or area, known crop/soil/method', () => {
    const base = { name: 'Z', cropId: 'tomato', soilId: 'loam', method: 'drip' }
    expect(zoneCreate.safeParse(base).success).toBe(false)
    expect(zoneCreate.safeParse({ ...base, areaM2: 500 }).success).toBe(true)
    expect(zoneCreate.safeParse({ ...base, boundary: square }).success).toBe(true)
    expect(zoneCreate.safeParse({ ...base, areaM2: 500, cropId: 'corn' }).success).toBe(false)
    expect(zoneCreate.safeParse({ ...base, areaM2: 500, efficiency: 1.5 }).success).toBe(false)
    expect(zoneCreate.safeParse({ ...base, areaM2: 500, id: 'not-a-uuid' }).success).toBe(false)
  })
  it('farm lat/lon ranges and defaults', () => {
    expect(farmCreate.parse({ lat: 49, lon: -122 })).toEqual({ name: 'My farm', location: '', lat: 49, lon: -122 })
    expect(farmCreate.safeParse({ lat: 91, lon: 0 }).success).toBe(false)
  })
  it('sensor patch cannot change identity or telemetry', () => {
    expect(sensorPatch.parse({ name: 'A', deviceId: 'x', type: 'esp32', batteryPercent: 5 })).toEqual({ name: 'A' })
  })
  it('ttn connect restricts cluster to a bare id (no SSRF via host)', () => {
    const ok = { cluster: 'eu1', applicationId: 'my-app', apiKey: 'NNSXS.0123456789ABCDEF' }
    expect(ttnConnect.safeParse(ok).success).toBe(true)
    expect(ttnConnect.safeParse({ ...ok, cluster: 'evil.com/x' }).success).toBe(false)
    expect(ttnConnect.safeParse({ ...ok, cluster: 'eu1.example' }).success).toBe(false)
    expect(ttnConnect.safeParse({ ...ok, applicationId: '../admin' }).success).toBe(false)
  })
})

describe('ESP32 payload validation', () => {
  const schema = esp32Reading(() => NOW)
  it('accepts a minimal reading and normalizes timestamps', () => {
    expect(schema.parse({ device_id: 'esp32-0001', soil_moisture_percent: 22.5 })).toEqual({ device_id: 'esp32-0001', soil_moisture_percent: 22.5 })
    expect(schema.parse({ device_id: 'esp32-0001', soil_moisture_percent: 1, timestamp: '2026-10-22T13:00:00+02:00' }).timestamp).toBe('2026-10-22T11:00:00.000Z')
  })
  it('rejects out-of-range values and future timestamps beyond 5 minutes', () => {
    expect(schema.safeParse({ device_id: 'esp32-0001', soil_moisture_percent: 101 }).success).toBe(false)
    expect(schema.safeParse({ device_id: 'esp32-0001', soil_moisture_percent: 20, soil_temperature_c: 120 }).success).toBe(false)
    expect(schema.safeParse({ device_id: 'esp32-0001', soil_moisture_percent: 20, battery_percent: -1 }).success).toBe(false)
    expect(schema.safeParse({ device_id: 'esp32-0001', soil_moisture_percent: 20, timestamp: '2026-10-22T12:04:00Z' }).success).toBe(true)
    expect(schema.safeParse({ device_id: 'esp32-0001', soil_moisture_percent: 20, timestamp: '2026-10-22T12:06:00Z' }).success).toBe(false)
    expect(schema.safeParse({ device_id: 'bad id!', soil_moisture_percent: 20 }).success).toBe(false)
  })
})

describe('TTS uplink normalization', () => {
  const up = (decoded: unknown, extra: Record<string, unknown> = {}) => ({
    end_device_ids: { device_id: 'soil-1', application_ids: { application_id: 'app' } },
    received_at: '2026-10-22T11:59:00.123456789Z',
    uplink_message: { f_port: 1, decoded_payload: decoded, received_at: '2026-10-22T11:58:59.5Z', ...extra },
  })
  it('generic field names', () => {
    expect(ttn.parseUplink(up({ soil_moisture: 27.3, soil_temperature: 14.2, battery: 90 }), {}, NOW)).toEqual({
      ok: true, deviceId: 'soil-1', timestamp: '2026-10-22T11:58:59.500Z', soilMoisturePercent: 27.3, soilTemperatureC: 14.2, batteryPercent: 90,
    })
  })
  it('Dragino LSE01 style (string values, odd casing, battery in volts ignored)', () => {
    expect(ttn.parseUplink(up({ water_SOIL: '31.05', temp_SOIL: '12.40', Bat: 3.6, conduct_SOIL: 120 }), {}, NOW)).toMatchObject({
      ok: true, soilMoisturePercent: 31.05, soilTemperatureC: 12.4, batteryPercent: undefined,
    })
  })
  it('Milesight EM500-SMTC style', () => {
    expect(ttn.parseUplink(up({ moisture: 45, temperature: 18.5, battery: 100, ec: 200 }), {}, NOW)).toMatchObject({ ok: true, soilMoisturePercent: 45, soilTemperatureC: 18.5 })
  })
  it('fraction VWC with a per-connection mapping and nested paths', () => {
    expect(ttn.parseUplink(up({ sensor: { vwc: 0.234, t: 9 } }), { moisture: ['sensor.vwc'], temperature: ['sensor.t'], moistureScale: 'fraction' }, NOW)).toMatchObject({
      ok: true, soilMoisturePercent: 23.4, soilTemperatureC: 9,
    })
  })
  it('drops out-of-range optional fields but rejects bad moisture', () => {
    expect(normalizeDecoded({ moisture: 30, temperature: 300, battery: 250 }, {})).toEqual({ soilMoisturePercent: 30, soilTemperatureC: undefined, batteryPercent: undefined })
    expect(normalizeDecoded({ moisture: 130 }, {})).toBe('moisture_out_of_range')
    expect(normalizeDecoded({ luminosity: 3 }, {})).toBe('no_moisture_field')
  })
  it('reports non-uplinks, missing decoder, missing device and future timestamps', () => {
    expect(ttn.parseUplink({ end_device_ids: { device_id: 'soil-1' }, join_accept: {} }, {}, NOW)).toMatchObject({ ok: false, reason: 'not_an_uplink', ignore: true })
    expect(ttn.parseUplink(up(undefined), {}, NOW)).toMatchObject({ ok: false, reason: 'no_decoded_payload' })
    expect(ttn.parseUplink({ uplink_message: {} }, {}, NOW)).toMatchObject({ ok: false, reason: 'missing_device_id' })
    expect(ttn.parseUplink(up({ moisture: 1 }, { received_at: '2026-10-22T12:30:00Z' }), {}, NOW)).toMatchObject({ ok: false, reason: 'future_timestamp' })
  })
})

describe('secrets', () => {
  it('encryption round-trips and is randomized + authenticated', () => {
    const a = encrypt('NNSXS.secret-key', KEY)
    expect(a).not.toContain('secret')
    expect(encrypt('NNSXS.secret-key', KEY)).not.toBe(a)
    expect(decrypt(a, KEY)).toBe('NNSXS.secret-key')
    const parts = a.split('.')
    parts[3] = Buffer.from('tampered').toString('base64url')
    expect(() => decrypt(parts.join('.'), KEY)).toThrow()
    expect(() => decrypt(a, Buffer.alloc(32, 2))).toThrow()
  })
  it('hashes tokens with a server key and compares in constant time', () => {
    const h = hashSecret('device-token', KEY)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(hashSecret('device-token', Buffer.alloc(32, 2))).not.toBe(h)
    expect(verifySecret('device-token', h, KEY)).toBe(true)
    expect(verifySecret('device-tokeN', h, KEY)).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
  })
  it('claim codes are human-friendly and normalize typos', () => {
    const code = newClaimCode()
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/)
    expect(normalizeClaimCode('ab0l-1o2i x')).toBe('AB011021X')
    expect(normalizeClaimCode(code.toLowerCase().replace(/-/g, ' '))).toBe(normalizeClaimCode(code))
  })
})

describe('farm-scoping guard (mock DB)', () => {
  // Tagged-template mock: returns the role for (farmId, userId) pairs it knows.
  const members: Record<string, string> = { 'farm-a|u1': 'owner', 'farm-a|u2': 'viewer' }
  const db = ((_s: TemplateStringsArray, farmId: string, userId: string) => {
    const role = members[`${farmId}|${userId}`]
    return Promise.resolve(role ? [{ role }] : [])
  }) as unknown as Db
  it('lets members through with sufficient role', async () => {
    await expect(requireMember(db, { userId: 'u1' }, 'farm-a', 'owner')).resolves.toBe('owner')
    await expect(requireMember(db, { userId: 'u2' }, 'farm-a', 'viewer')).resolves.toBe('viewer')
  })
  it('hides other farms (404) and enforces roles (403)', async () => {
    await expect(requireMember(db, { userId: 'u3' }, 'farm-a', 'viewer')).rejects.toMatchObject({ status: 404, code: 'farm_not_found' })
    await expect(requireMember(db, { userId: 'u1' }, 'farm-b', 'viewer')).rejects.toBeInstanceOf(HttpError)
    await expect(requireMember(db, { userId: 'u2' }, 'farm-a', 'editor')).rejects.toMatchObject({ status: 403 })
  })
})

describe('router', () => {
  const id = '11111111-1111-4111-8111-111111111111'
  it('matches literals before params and validates ids', () => {
    expect(match('GET', `/farms/${id}/sensors/status`)).toMatchObject({ params: { farmId: id } })
    expect(match('POST', `/farms/${id}/lorawan/ttn/connect`)).toMatchObject({ params: { farmId: id } })
    expect(match('GET', '/farms/not-a-uuid/data')).toBeNull()
    expect(match('PUT', '/farms')).toBe('method')
  })
  it('answers 503 backend_not_configured when env is missing', async () => {
    expect(loadConfig({})).toBeNull()
    vi.stubEnv('DATABASE_URL', '')
    const res = await createHandler(defaultDeps)(new Request('https://x/api/farms'))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'backend_not_configured' })
    vi.unstubAllEnvs()
  })
  it('rejects a malformed encryption key with 500 and no detail', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://x')
    vi.stubEnv('GEOVIVA_ENCRYPTION_KEY', 'short')
    vi.stubEnv('SUPABASE_URL', 'https://p.supabase.co')
    const res = await createHandler(defaultDeps)(new Request('https://x/api/farms'))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'backend_misconfigured' })
    vi.unstubAllEnvs()
  })
})
