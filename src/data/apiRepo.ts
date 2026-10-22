// FarmRepository over the GeoViva HTTP API (server/ + api/). Used for the 'mine' dataset when
// VITE_API_URL is set; the sample farm always stays in the browser.
//
// Auth hook point: call setAuthTokenProvider() once at startup with something that returns the
// current access token, e.g. with Supabase:
//   const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
//   setAuthTokenProvider(async () => (await supabase.auth.getSession()).data.session?.access_token ?? null)
import type { FarmData, IrrigationEvent, Sensor, SensorReading, Zone } from '../types'
import type { Dataset, FarmRepository } from './repo'

type TokenProvider = () => string | null | Promise<string | null>
let tokenProvider: TokenProvider = () => null

export function setAuthTokenProvider(fn: TokenProvider) {
  tokenProvider = fn
  farmIdPromise = null // a different user may own a different farm
}

export async function getAuthToken(): Promise<string | null> {
  return tokenProvider()
}

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

const apiBase = () => String(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export async function apiFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = await getAuthToken()
  if (!token) throw new ApiError(401, 'not_signed_in', 'Sign in to load your farm from the GeoViva server.')
  let res: Response
  try {
    res = await fetch(`${apiBase()}/api${path}`, {
      method: init.method ?? 'GET',
      headers: { authorization: `Bearer ${token}`, ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'network_error', 'Could not reach the GeoViva server. Check your connection and retry.')
  }
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = res.status === 503 ? 'The GeoViva server is not set up yet.' : body.message ?? `Server error (${res.status})`
    throw new ApiError(res.status, body.error ?? 'error', msg)
  }
  return body as T
}

let farmIdPromise: Promise<string> | null = null

/** The signed-in user's farm (first one); created on first use so 'mine' works immediately. */
export function currentFarmId(): Promise<string> {
  farmIdPromise ??= (async () => {
    const { farms } = await apiFetch<{ farms: { id: string }[] }>('/farms')
    if (farms.length) return farms[0].id
    const farm = await apiFetch<{ id: string }>('/farms', { method: 'POST', body: { name: 'My farm', location: 'Set your farm location', lat: 49.05, lon: -122.3 } })
    return farm.id
  })().catch((e) => {
    farmIdPromise = null
    throw e
  })
  return farmIdPromise
}

export function apiRepository(_dataset: Dataset): FarmRepository {
  // Ids the server already has, so saveZone/saveSensor ("create or update by id") pick POST vs PATCH.
  const known = { zones: new Set<string>(), sensors: new Set<string>() }
  const farmPath = async (p = '') => `/farms/${await currentFarmId()}${p}`

  return {
    async load() {
      const data = await apiFetch<FarmData>(await farmPath('/data'))
      known.zones = new Set(data.zones.map((z) => z.id))
      known.sensors = new Set(data.sensors.map((s) => s.id))
      return data
    },
    async updateFarm(farm) {
      const { name, location, lat, lon } = farm
      return apiFetch<FarmData['farm']>(await farmPath(), { method: 'PATCH', body: { name, location, lat, lon } })
    },
    async saveZone(zone) {
      const { id, farmId: _f, createdAt: _c, updatedAt: _u, ...fields } = zone
      const saved = known.zones.has(id)
        ? await apiFetch<Zone>(await farmPath(`/zones/${id}`), { method: 'PATCH', body: fields })
        : await apiFetch<Zone>(await farmPath('/zones'), { method: 'POST', body: { id, ...fields } })
      known.zones.add(saved.id)
      return saved
    },
    async deleteZone(id) {
      await apiFetch<void>(await farmPath(`/zones/${id}`), { method: 'DELETE' })
      known.zones.delete(id)
    },
    async saveSensor(sensor) {
      const { id, name, depthCm, zoneId, lat, lon } = sensor
      const saved = known.sensors.has(id)
        ? await apiFetch<Sensor>(await farmPath(`/sensors/${id}`), { method: 'PATCH', body: { name, depthCm, zoneId, lat, lon } })
        : await apiFetch<Sensor>(await farmPath('/sensors'), {
            method: 'POST',
            body: { id, name, deviceId: sensor.deviceId, type: sensor.type, provider: sensor.provider, depthCm, zoneId, lat, lon },
          })
      known.sensors.add(saved.id)
      return saved
    },
    async deleteSensor(id) {
      await apiFetch<void>(await farmPath(`/sensors/${id}`), { method: 'DELETE' })
      known.sensors.delete(id)
    },
    async addReading(r) {
      // Device readings arrive through ingestion endpoints; the browser only adds manual / CSV readings.
      const source = r.source === 'csv' ? 'csv' : 'manual'
      return apiFetch<SensorReading>(await farmPath('/readings/manual'), {
        method: 'POST',
        body: { id: r.id, zoneId: r.zoneId, timestamp: r.timestamp, soilMoisturePercent: r.soilMoisturePercent, soilTemperatureC: r.soilTemperatureC, depthCm: r.depthCm, source },
      })
    },
    async addEvent(e) {
      return apiFetch<IrrigationEvent>(await farmPath('/irrigation-events'), {
        method: 'POST',
        body: { id: e.id, zoneId: e.zoneId, timestamp: e.timestamp, mm: e.mm, litres: e.litres, note: e.note },
      })
    },
  }
}
