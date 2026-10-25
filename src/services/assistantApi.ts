// Client for Luke (POST /api/assistant). Same-origin on Vercel; VITE_API_URL points elsewhere when set.
// Any failure (offline, no key on the server, dev server without /api) means "use the offline guide search".
import type { ZoneStatus } from '../state/farmStore'
import type { Sensor, Zone } from '../types'
import { STATUS, timeAgo } from '../ui/kit'
import { getAuthToken } from '../data/apiRepo'

export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

export class AssistantUnavailableError extends Error {}

export interface ContextInput {
  dataset: 'sample' | 'mine'
  route: string
  zones: Zone[]
  sensors: Sensor[]
  zoneStatus: (zoneId: string) => ZoneStatus
  sensorState: (s: Sensor) => string
  now?: number
}

/**
 * Plain-text snapshot of the farmer's data for Luke. The Sample farm is described too, so the demo can show detailed answers.
 * On a zone page only that zone is described in detail; elsewhere a one-line summary per zone.
 */
export function buildContext({ route, zones, sensors, zoneStatus, sensorState, now = Date.now() }: ContextInput): string | undefined {
  const lines = [`Screen: ${route}`]
  const openZone = zones.find((z) => route.startsWith(`/zones/${z.id}`))
  for (const z of openZone ? [openZone] : zones) {
    const zs = zoneStatus(z.id)
    lines.push(
      `Zone "${z.name}": ${STATUS[zs.status].label}; crop ${z.cropId}, soil ${z.soilId}, ${z.method}, ${Math.round(z.areaM2)} m²; ` +
        `moisture ${zs.moisturePct ?? 'no reading'}%${zs.lastUpdate ? `, last reading ${timeAgo(zs.lastUpdate, now)}` : ''}.`,
    )
    if (openZone && zs.rec) {
      lines.push(`Advice: ${zs.rec.summary}${zs.rec.grossMm > 0 ? ` Apply ${zs.rec.grossMm.toFixed(1)} mm (${Math.round(zs.rec.litres)} L), ${zs.rec.timing}.` : ''}`)
      for (const f of zs.rec.factors) lines.push(`- ${f.label}: ${f.value} (${f.effect} need)`)
    }
  }
  const relevant = openZone ? sensors.filter((s) => s.zoneId === openZone.id) : route.startsWith('/sensors') ? sensors : []
  for (const s of relevant) {
    const zone = zones.find((z) => z.id === s.zoneId)?.name ?? 'no zone'
    lines.push(`Sensor "${s.name}" (${s.type}, ${zone}): ${s.type === 'manual' ? 'manual' : sensorState(s)}${s.lastSeen ? `, last seen ${timeAgo(s.lastSeen, now)}` : ''}${s.batteryPercent !== undefined ? `, battery ${s.batteryPercent}%` : ''}.`)
  }
  return lines.join('\n').slice(0, 6000)
}

const base = () => String(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export async function askLuke(question: string, history: ChatTurn[], context?: string, demo = false): Promise<string> {
  if (!navigator.onLine) throw new AssistantUnavailableError('offline')
  const token = await getAuthToken() // signed-in farmers get their own (and on Grower, a higher) question limit
  let res: Response
  try {
    res = await fetch(`${base()}/api/assistant`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ question, history: history.slice(-12), context, demo }),
    })
  } catch {
    throw new AssistantUnavailableError('network')
  }
  const body = (await res.json().catch(() => null)) as { answer?: string; message?: string; error?: string } | null
  if (res.ok && body?.answer) return body.answer
  // Rate limits and upstream errors carry a farmer-readable message; everything else falls back to search.
  if (body?.message && (res.status === 429 || res.status === 502)) throw new Error(body.message)
  throw new AssistantUnavailableError(body?.error ?? `status ${res.status}`)
}
