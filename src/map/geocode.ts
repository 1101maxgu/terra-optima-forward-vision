// Nominatim (OSM) place search. Usage policy: max 1 request/second, no autocomplete, attribution, cache results.
// https://operations.osmfoundation.org/policies/nominatim/
import type { LngLat } from './index'

export interface Place {
  label: string
  center: LngLat
  bbox?: [[number, number], [number, number]] // [[west, south], [east, north]]
}

interface NominatimHit {
  display_name?: string
  lat?: string
  lon?: string
  boundingbox?: [string, string, string, string] // [south, north, west, east]
}

export function parseNominatim(json: unknown): Place[] {
  if (!Array.isArray(json)) return []
  return (json as NominatimHit[]).flatMap((h) => {
    const lat = Number(h.lat)
    const lon = Number(h.lon)
    if (!h.display_name || !Number.isFinite(lat) || !Number.isFinite(lon)) return []
    const b = h.boundingbox?.map(Number)
    const bbox = b && b.length === 4 && b.every(Number.isFinite) ? ([[b[2], b[0]], [b[3], b[1]]] as Place['bbox']) : undefined
    return [{ label: h.display_name, center: [lon, lat] as LngLat, bbox }]
  })
}

const cache = new Map<string, Place[]>()
let nextSlot = 0 // earliest time the next request may go out

/** Searches Canada. Throws on network/HTTP failure; resolves [] for no results. Abort via signal. */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const q = query.trim().replace(/\s+/g, ' ')
  const key = q.toLowerCase()
  const hit = cache.get(key)
  if (hit) return hit
  const wait = nextSlot - Date.now()
  nextSlot = Math.max(Date.now(), nextSlot) + 1100
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  signal?.throwIfAborted()
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=ca&limit=5&q=${encodeURIComponent(q)}`
  const res = await fetch(url, { signal, headers: { 'Accept-Language': 'en' } })
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const places = parseNominatim(await res.json())
  cache.set(key, places)
  return places
}
