// Data access layer. Everything the UI persists goes through FarmRepository, so the
// browser-storage implementation below can be swapped for the HTTP API (src/data/apiRepo.ts)
// without touching components. Datasets are isolated: 'sample' never mixes with 'mine'.
import type { FarmData, IrrigationEvent, Sensor, SensorReading, Zone } from '../types'
import { buildSampleData } from './sampleDataset'
import { apiRepository } from './apiRepo'

export type Dataset = 'sample' | 'mine'

export interface FarmRepository {
  load(): Promise<FarmData>
  updateFarm(farm: FarmData['farm']): Promise<FarmData['farm']>
  saveZone(zone: Zone): Promise<Zone> // create or update by id
  deleteZone(id: string): Promise<void>
  saveSensor(sensor: Sensor): Promise<Sensor>
  deleteSensor(id: string): Promise<void>
  addReading(reading: SensorReading): Promise<SensorReading>
  addEvent(event: IrrigationEvent): Promise<IrrigationEvent>
}

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

const MY_FARM: FarmData = {
  farm: { id: 'my-farm', name: 'My farm', location: 'Set your farm location', lat: 49.05, lon: -122.3 },
  zones: [], sensors: [], readings: [], events: [],
}

interface Stored { savedAt: number; data: FarmData }
const key = (d: Dataset) => `geoviva:data:${d}`

/** Shifts simulated timestamps forward so the sample farm always looks current ("sample clock"). */
function shiftSample(data: FarmData, ms: number): FarmData {
  if (ms <= 0) return data
  const sh = (t?: string) => (t ? new Date(Date.parse(t) + ms).toISOString() : t)
  return {
    ...data,
    sensors: data.sensors.map((s) => (s.deviceId.startsWith('sample-') ? { ...s, lastSeen: sh(s.lastSeen) } : s)),
    readings: data.readings.map((r) => (r.source === 'sample' ? { ...r, timestamp: sh(r.timestamp)! } : r)),
    events: data.events.map((e) => (e.source === 'sample' ?{ ...e, timestamp: sh(e.timestamp)! } : e)),
  }
}

export function localRepository(dataset: Dataset): FarmRepository {
  let cache: FarmData | null = null

  function read(): FarmData {
    if (cache) return cache
    let stored: Stored | null = null
    try {
      const raw = localStorage.getItem(key(dataset))
      stored = raw ? (JSON.parse(raw) as Stored) : null
    } catch {
      stored = null
    }
    if (!stored) cache = dataset === 'sample' ? buildSampleData() : structuredClone(MY_FARM)
    else cache = dataset === 'sample' ? shiftSample(stored.data, Date.now() - stored.savedAt) : stored.data
    return cache
  }

  // Throws if storage is unavailable/full so callers can show Retry and keep unsaved input.
  function write(next: FarmData) {
    localStorage.setItem(key(dataset), JSON.stringify({ savedAt: Date.now(), data: next } satisfies Stored))
    cache = next
  }

  const upsert = <T extends { id: string }>(list: T[], item: T) =>
    list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]

  return {
    async load() {
      return read()
    },
    async updateFarm(farm) {
      write({ ...read(), farm })
      return farm
    },
    async saveZone(zone) {
      const z = { ...zone, updatedAt: new Date().toISOString(), createdAt: zone.createdAt ?? new Date().toISOString() }
      write({ ...read(), zones: upsert(read().zones, z) })
      return z
    },
    async deleteZone(id) {
      const d = read()
      // Sensors stay registered but become unassigned; readings for the zone are kept for history.
      write({ ...d, zones: d.zones.filter((z) => z.id !== id), sensors: d.sensors.map((s) => (s.zoneId === id ? { ...s, zoneId: null } : s)) })
    },
    async saveSensor(sensor) {
      write({ ...read(), sensors: upsert(read().sensors, sensor) })
      return sensor
    },
    async deleteSensor(id) {
      const d = read()
      write({ ...d, sensors: d.sensors.filter((s) => s.id !== id) })
    },
    async addReading(reading) {
      write({ ...read(), readings: [...read().readings, reading] })
      return reading
    },
    async addEvent(event) {
      write({ ...read(), events: [...read().events, event] })
      return event
    },
  }
}

/** Resets the sample farm to its generated state (does not touch 'mine'). */
export function resetSample() {
  try {
    localStorage.removeItem(key('sample'))
  } catch {
    /* nothing stored */
  }
}

export function createRepository(dataset: Dataset): FarmRepository {
  // Backend switch point: the farmer's own data goes to the HTTP API when it is configured; sample stays local.
  if (import.meta.env.VITE_API_URL && dataset === 'mine') return apiRepository(dataset)
  return localRepository(dataset)
}
