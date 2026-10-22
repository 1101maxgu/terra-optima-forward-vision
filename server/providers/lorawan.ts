// LoRaWAN network-server providers behind one interface. The Things Stack (TTN / TTS Cloud)
// is implemented; ChirpStack is stubbed with its event format documented for a later add.
import { MAX_FUTURE_MS } from '../schemas.js'

export type ProviderId = 'ttn' | 'chirpstack'

export interface ProviderConnection {
  cluster: string | null
  applicationId: string
  apiKey: string
}

export interface RemoteDevice {
  deviceId: string
  name: string
  lastSeen?: string
}

export interface FieldMapping {
  moisture?: string[]
  temperature?: string[]
  battery?: string[]
  moistureScale?: 'percent' | 'fraction'
}

export type Uplink =
  | { ok: true; deviceId: string; timestamp: string; soilMoisturePercent: number; soilTemperatureC?: number; batteryPercent?: number }
  | { ok: false; reason: string; deviceId?: string; ignore?: boolean }

export class ProviderError extends Error {
  code: 'invalid_api_key' | 'application_not_found' | 'provider_unreachable' | 'not_implemented'
  constructor(code: ProviderError['code'], message?: string) {
    super(message ?? code)
    this.code = code
  }
}

export interface LorawanProvider {
  id: ProviderId
  /** Throws ProviderError when the credentials cannot read the application's devices. */
  verify(conn: ProviderConnection, f?: typeof fetch): Promise<void>
  listDevices(conn: ProviderConnection, f?: typeof fetch): Promise<RemoteDevice[]>
  /** Best-effort: returns false when the key lacks rights (farmer then adds the webhook by hand). */
  createWebhook(conn: ProviderConnection, hook: { id: string; url: string; headers: Record<string, string> }, f?: typeof fetch): Promise<boolean>
  parseUplink(body: unknown, mapping: FieldMapping, now?: number): Uplink
}

// ---------- payload normalization (shared by providers) ----------

export const DEFAULT_MAPPING: Required<Omit<FieldMapping, 'moistureScale'>> = {
  // Common decoder outputs: generic, Dragino LSE01 (water_SOIL/temp_SOIL), Milesight EM500-SMTC (moisture/temperature).
  moisture: ['soil_moisture_percent', 'soil_moisture', 'moisture', 'vwc', 'water_soil', 'soil_water', 'soilmoisture'],
  temperature: ['soil_temperature_c', 'soil_temperature', 'temp_soil', 'soil_temp', 'soiltemperature', 'temperature'],
  // Percent only; voltage fields (e.g. Dragino "Bat" in volts) are deliberately not mapped.
  battery: ['battery_percent', 'battery_level', 'battery', 'bat_percent'],
}

const toNum = (v: unknown): number | undefined => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}

/** Finds the first numeric field. Plain keys match case-insensitively at the top level; "a.b" walks a path. */
export function pickNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
  const lower = new Map(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v]))
  for (const k of keys) {
    const v = k.includes('.')
      ? k.split('.').reduce<unknown>((o, p) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[p] : undefined), obj)
      : lower.get(k.toLowerCase())
    const n = toNum(v)
    if (n !== undefined) return n
  }
  return undefined
}

/** Decoded payload -> normalized values with range checks. Moisture is required; bad optional fields are dropped. */
export function normalizeDecoded(decoded: Record<string, unknown>, mapping: FieldMapping): { soilMoisturePercent: number; soilTemperatureC?: number; batteryPercent?: number } | string {
  let m = pickNumber(decoded, mapping.moisture ?? DEFAULT_MAPPING.moisture)
  if (m === undefined) return 'no_moisture_field'
  if (mapping.moistureScale === 'fraction') m *= 100
  if (m < 0 || m > 100) return 'moisture_out_of_range'
  const t = pickNumber(decoded, mapping.temperature ?? DEFAULT_MAPPING.temperature)
  const b = pickNumber(decoded, mapping.battery ?? DEFAULT_MAPPING.battery)
  return {
    soilMoisturePercent: Math.round(m * 100) / 100,
    soilTemperatureC: t !== undefined && t >= -40 && t <= 85 ? t : undefined,
    batteryPercent: b !== undefined && b >= 0 && b <= 100 ? b : undefined,
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

// ---------- The Things Stack ----------

const ttsBase = (cluster: string | null) => {
  // Cluster is validated as /^[a-z0-9]{2,10}$/ before it gets here; the host suffix is fixed.
  if (!cluster || !/^[a-z0-9]{2,10}$/.test(cluster)) throw new ProviderError('application_not_found', 'Invalid cluster')
  return `https://${cluster}.cloud.thethings.network/api/v3`
}

async function ttsFetch(conn: ProviderConnection, path: string, init: RequestInit = {}, f: typeof fetch = fetch): Promise<Response> {
  let res: Response
  try {
    res = await f(`${ttsBase(conn.cluster)}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${conn.apiKey}`, accept: 'application/json', 'content-type': 'application/json', ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(8000),
    })
  } catch {
    throw new ProviderError('provider_unreachable', 'Could not reach The Things Stack')
  }
  return res
}

function ttsError(res: Response): ProviderError {
  if (res.status === 401 || res.status === 403) return new ProviderError('invalid_api_key', 'The API key was rejected or lacks rights to read devices')
  if (res.status === 404) return new ProviderError('application_not_found', 'Application not found on this cluster')
  return new ProviderError('provider_unreachable', `The Things Stack answered ${res.status}`)
}

const appPath = (id: string) => `/applications/${encodeURIComponent(id)}`

export const ttn: LorawanProvider = {
  id: 'ttn',
  async verify(conn, f) {
    const res = await ttsFetch(conn, `${appPath(conn.applicationId)}/devices?field_mask=name&limit=1`, {}, f)
    if (!res.ok) throw ttsError(res)
  },
  async listDevices(conn, f) {
    const out: RemoteDevice[] = []
    for (let page = 1; page <= 10; page++) {
      // ponytail: caps at 1000 devices (10 pages x 100); plenty for a small farm.
      const res = await ttsFetch(conn, `${appPath(conn.applicationId)}/devices?field_mask=name,last_seen_at&limit=100&page=${page}`, {}, f)
      if (!res.ok) throw ttsError(res)
      const body = (await res.json()) as { end_devices?: { ids?: { device_id?: string }; name?: string; last_seen_at?: string }[] }
      const devs = body.end_devices ?? []
      for (const d of devs) {
        const id = d.ids?.device_id
        if (id) out.push({ deviceId: id, name: d.name || id, lastSeen: d.last_seen_at })
      }
      if (devs.length < 100) break
    }
    return out
  },
  async createWebhook(conn, hook, f) {
    const body = {
      webhook: {
        ids: { webhook_id: hook.id, application_ids: { application_id: conn.applicationId } },
        base_url: hook.url,
        format: 'json',
        headers: hook.headers,
        uplink_message: { path: '' },
      },
      field_mask: 'base_url,format,headers,uplink_message',
    }
    try {
      const res = await ttsFetch(conn, `/as/webhooks/${encodeURIComponent(conn.applicationId)}`, { method: 'POST', body: JSON.stringify(body) }, f)
      // 409: a webhook with this id already exists (e.g. reconnect); update it in place.
      if (res.status === 409) {
        const put = await ttsFetch(conn, `/as/webhooks/${encodeURIComponent(conn.applicationId)}/${encodeURIComponent(hook.id)}`, { method: 'PUT', body: JSON.stringify(body) }, f)
        return put.ok
      }
      return res.ok
    } catch {
      return false
    }
  },
  /** TTS webhook (JSON format) uplink: { end_device_ids: { device_id }, received_at, uplink_message: { decoded_payload, received_at } }. */
  parseUplink(body, mapping, now = Date.now()) {
    if (!isObj(body)) return { ok: false, reason: 'invalid_body' }
    const ids = isObj(body.end_device_ids) ? body.end_device_ids : undefined
    const deviceId = typeof ids?.device_id === 'string' ? ids.device_id : undefined
    if (!deviceId) return { ok: false, reason: 'missing_device_id' }
    const up = body.uplink_message
    // join_accept, downlink_* and other events can arrive on the same webhook if enabled; ignore them.
    if (!isObj(up)) return { ok: false, reason: 'not_an_uplink', deviceId, ignore: true }
    if (!isObj(up.decoded_payload)) return { ok: false, reason: 'no_decoded_payload', deviceId }
    const raw = typeof up.received_at === 'string' ? up.received_at : typeof body.received_at === 'string' ? body.received_at : undefined
    const ts = raw ? Date.parse(raw) : now
    if (!Number.isFinite(ts)) return { ok: false, reason: 'invalid_timestamp', deviceId }
    if (ts > now + MAX_FUTURE_MS) return { ok: false, reason: 'future_timestamp', deviceId }
    const values = normalizeDecoded(up.decoded_payload, mapping)
    if (typeof values === 'string') return { ok: false, reason: values, deviceId }
    return { ok: true, deviceId, timestamp: new Date(ts).toISOString(), ...values }
  },
}

// ---------- ChirpStack (stub) ----------
// ChirpStack v4 HTTP integration POSTs to <url>?event=up with JSON like
//   { "deduplicationId", "time": ISO, "deviceInfo": { "devEui", "deviceName", "applicationId", "tenantId" },
//     "object": { ...decoded codec output... }, "rxInfo": [...] }
// Other events (join, ack, status, log) arrive with ?event=join|ack|status|log.
// To implement: verify/list via the ChirpStack REST/gRPC API (base URL per connection instead of a
// cluster), parseUplink maps deviceInfo.devEui -> deviceId, time -> timestamp, object -> normalizeDecoded().
const notImplemented = async (): Promise<never> => {
  throw new ProviderError('not_implemented', 'ChirpStack is not supported yet')
}
export const chirpstack: LorawanProvider = {
  id: 'chirpstack',
  verify: notImplemented,
  listDevices: notImplemented,
  createWebhook: async () => false,
  parseUplink: () => ({ ok: false, reason: 'not_implemented' }),
}

export const PROVIDERS: Record<ProviderId, LorawanProvider> = { ttn, chirpstack }
