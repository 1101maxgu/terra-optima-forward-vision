import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getWeather, parseOpenMeteo } from './weather'
import sample from '../data/sampleWeather.json'

function payload(n = 14) {
  const r = (v: number) => Array.from({ length: n }, () => v)
  return {
    daily: {
      time: Array.from({ length: n }, (_, i) => `2026-07-${String(i + 1).padStart(2, '0')}`),
      temperature_2m_max: r(30),
      temperature_2m_min: r(14),
      precipitation_sum: r(1.5),
      et0_fao_evapotranspiration: r(5.2),
    },
  }
}

const okFetch = (body: unknown) => vi.fn(async () => ({ ok: true, json: async () => body }))

function memoryStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  }
}

beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('parseOpenMeteo', () => {
  it('maps fields', () => {
    const days = parseOpenMeteo(payload())!
    expect(days).toHaveLength(14)
    expect(days[0]).toEqual({ date: '2026-07-01', tMaxC: 30, tMinC: 14, rainMm: 1.5, et0Mm: 5.2 })
  })
  it('treats null rain as 0 but rejects null ET0, short or ragged arrays', () => {
    const p = payload()
    ;(p.daily.precipitation_sum as (number | null)[])[3] = null
    expect(parseOpenMeteo(p)![3].rainMm).toBe(0)
    const q = payload()
    ;(q.daily.et0_fao_evapotranspiration as (number | null)[])[2] = null
    expect(parseOpenMeteo(q)).toBeNull()
    expect(parseOpenMeteo(payload(7))).toBeNull()
    const ragged = payload()
    ragged.daily.temperature_2m_min.pop()
    expect(parseOpenMeteo(ragged)).toBeNull()
    expect(parseOpenMeteo(null)).toBeNull()
    expect(parseOpenMeteo({ error: true, reason: 'x' })).toBeNull()
  })
})

describe('getWeather', () => {
  it('live success maps fields and caches', async () => {
    const fetchMock = okFetch(payload())
    vi.stubGlobal('fetch', fetchMock)
    const w = await getWeather(49.05, -122.3)
    expect(w.source).toBe('live')
    expect(w.provenance).toBe('live-weather')
    expect(w.days[0].et0Mm).toBe(5.2)
    expect(w.fetchedAt).toBeTruthy()
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('et0_fao_evapotranspiration')
    expect(JSON.parse(localStorage.getItem('geoviva:weather')!).days).toHaveLength(14)
  })

  it('network error with no cache -> bundled', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))))
    const w = await getWeather(49.05, -122.3)
    expect(w).toEqual({ days: sample.days, source: 'bundled', provenance: 'simulated' })
  })

  it('bad payload -> bundled', async () => {
    vi.stubGlobal('fetch', okFetch({ daily: { time: [] } }))
    expect((await getWeather(49.05, -122.3)).source).toBe('bundled')
  })

  it('cache hit after failure; other location or stale cache ignored', async () => {
    vi.stubGlobal('fetch', okFetch(payload()))
    await getWeather(49.05, -122.3)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })))
    const w = await getWeather(49.0501, -122.3001)
    expect(w.source).toBe('cache')
    expect(w.provenance).toBe('live-weather')
    expect((await getWeather(50, -120)).source).toBe('bundled')

    const c = JSON.parse(localStorage.getItem('geoviva:weather')!)
    c.fetchedAt = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString()
    localStorage.setItem('geoviva:weather', JSON.stringify(c))
    expect((await getWeather(49.05, -122.3)).source).toBe('bundled')
  })

  it('works when localStorage throws', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    })
    vi.stubGlobal('fetch', okFetch(payload()))
    expect((await getWeather(49.05, -122.3)).source).toBe('live')
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('x'))))
    expect((await getWeather(49.05, -122.3)).source).toBe('bundled')
  })

  it('times out after 5 s and falls back', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))),
      ),
    )
    const p = getWeather(49.05, -122.3)
    await vi.advanceTimersByTimeAsync(5000)
    expect((await p).source).toBe('bundled')
  })
})
