// Weather: live Open-Meteo -> localStorage cache (<7 days, same location) -> bundled sample. Never rejects.
import type { Weather, WeatherDay } from '../types'
import sample from '../data/sampleWeather.json'

const CACHE_KEY = 'geoviva:weather'
const TIMEOUT_MS = 5000
const CACHE_MAX_AGE_MS = 7 * 24 * 3600 * 1000
const MIN_DAYS = 14

interface CachedWeather {
  lat: number
  lon: number
  fetchedAt: string
  days: WeatherDay[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

function forecastUrl(lat: number, lon: number): string {
  return (
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration' +
    '&timezone=America%2FVancouver&forecast_days=14'
  )
}

/**
 * Strictly validates an Open-Meteo daily payload and maps it to WeatherDay[].
 * Null precipitation is treated as 0 mm; null temperature/ET0 rejects the payload.
 * Returns null on any shape problem.
 */
export function parseOpenMeteo(json: unknown): WeatherDay[] | null {
  const daily = (json as { daily?: Record<string, unknown> } | null)?.daily
  if (!daily || typeof daily !== 'object') return null
  const { time, temperature_2m_max: tMax, temperature_2m_min: tMin, precipitation_sum: rain, et0_fao_evapotranspiration: et0 } =
    daily as Record<string, unknown>
  const arrays = [time, tMax, tMin, rain, et0]
  if (!arrays.every(Array.isArray)) return null
  const n = (time as unknown[]).length
  if (n < MIN_DAYS || !arrays.every((a) => (a as unknown[]).length === n)) return null

  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const days: WeatherDay[] = []
  for (let i = 0; i < n; i++) {
    const date = (time as unknown[])[i]
    const hi = num((tMax as unknown[])[i])
    const lo = num((tMin as unknown[])[i])
    const r = (rain as unknown[])[i] === null ? 0 : num((rain as unknown[])[i])
    const e = num((et0 as unknown[])[i])
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
    if (hi === null || lo === null || r === null || e === null || r < 0 || e < 0) return null
    days.push({ date, tMaxC: hi, tMinC: lo, rainMm: r, et0Mm: e })
  }
  return days
}

function readCache(lat: number, lon: number): CachedWeather | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as CachedWeather
    const age = Date.now() - Date.parse(c.fetchedAt)
    if (round2(c.lat) !== round2(lat) || round2(c.lon) !== round2(lon)) return null
    if (!(age >= 0 && age < CACHE_MAX_AGE_MS)) return null
    if (!Array.isArray(c.days) || c.days.length < MIN_DAYS) return null
    return c
  } catch {
    return null
  }
}

function writeCache(c: CachedWeather): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c))
  } catch {
    /* storage unavailable: live data still returned */
  }
}

async function fetchLive(lat: number, lon: number): Promise<WeatherDay[] | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(forecastUrl(lat, lon), { signal: ctrl.signal })
    if (!res.ok) return null
    return parseOpenMeteo(await res.json())
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Never throws. Live -> cache -> bundled. */
export async function getWeather(lat: number, lon: number): Promise<Weather> {
  const days = await fetchLive(lat, lon)
  if (days) {
    const fetchedAt = new Date().toISOString()
    writeCache({ lat, lon, fetchedAt, days })
    return { days, source: 'live', provenance: 'live-weather', fetchedAt }
  }
  const cached = readCache(lat, lon)
  if (cached) return { days: cached.days, source: 'cache', provenance: 'live-weather', fetchedAt: cached.fetchedAt }
  return { days: sample.days, source: 'bundled', provenance: 'simulated' }
}
