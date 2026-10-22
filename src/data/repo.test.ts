import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { localRepository } from './repo'

const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) })
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-22T12:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const ageMin = (iso: string) => Math.round((Date.now() - Date.parse(iso)) / 60_000)

it('sample clock: sensor ages stay constant across sessions even if the app sat open before saving', async () => {
  const repo = localRepository('sample')
  const s1 = (await repo.load()).sensors.find((s) => s.name === 'TTN-001')!
  const start = ageMin(s1.lastSeen!)

  vi.advanceTimersByTime(90 * 60_000) // app open 90 min, then a save
  await repo.saveZone({ id: 'z', name: 'New', cropId: 'tomato', soilId: 'loam', method: 'drip', areaM2: 100 })

  vi.advanceTimersByTime(3 * 24 * 3600_000) // reopened 3 days later
  const again = (await localRepository('sample').load()).sensors.find((s) => s.name === 'TTN-001')!
  expect(ageMin(again.lastSeen!)).toBe(start)
})

it('my farm is separate from the sample farm', async () => {
  await localRepository('sample').saveZone({ id: 'z', name: 'Sample-only', cropId: 'tomato', soilId: 'loam', method: 'drip', areaM2: 100 })
  expect((await localRepository('mine').load()).zones).toEqual([])
})
