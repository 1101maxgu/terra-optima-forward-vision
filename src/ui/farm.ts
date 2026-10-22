// Farm-level derived helpers shared by the shell and pages. Everything here reads real store data.
import { useMemo } from 'react'
import type { CropId, FarmerStatus, Recommendation } from '../types'
import { useFarm } from '../state/farmStore'

export const CROP_EMOJI: Record<CropId, string> = { tomato: '🍅', lettuce: '🥬', blueberry: '🫐', strawberry: '🍓' }

/** "Zone A · Field tomatoes" -> "Zone A" for tight spaces; names without a separator are kept. */
export const shortName = (name: string) => name.split(' · ')[0]

/** Most urgent first. */
export const STATUS_RANK: Record<FarmerStatus, number> = { 'water-today': 0, 'check-sensor': 1, 'water-soon': 2, 'no-water': 3 }

/** Farmer-friendly version of rec.timing. */
export function bestTime(rec?: Recommendation): string {
  if (!rec) return '—'
  return {
    'irrigate-now': 'Today, early morning or evening',
    'irrigate-soon': 'Within 48 h, early morning',
    'skip-rain': 'Skip, rain expected',
    ok: 'Not needed',
  }[rec.status]
}

export function greeting(d = new Date()): string {
  const h = d.getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export interface FarmAlert {
  id: string
  level: 'alert' | 'warn' | 'info'
  text: string
  href: string
  at?: string // ISO, when known
}

/** Alerts derived from current data: water today, offline/never-seen sensors, low battery, heavy rain, missing readings. */
export function useAlerts(): FarmAlert[] {
  const { zones, sensors, weather, zoneStatus, sensorState } = useFarm()
  return useMemo(() => {
    const out: FarmAlert[] = []
    for (const z of zones) {
      const st = zoneStatus(z.id)
      if (st.status === 'water-today' && st.rec)
        out.push({ id: `w-${z.id}`, level: 'alert', text: `${z.name} needs water today (${st.rec.grossMm} mm)`, href: `/zones/${z.id}`, at: st.lastUpdate ?? undefined })
      if (!st.lastUpdate) out.push({ id: `n-${z.id}`, level: 'warn', text: `No readings yet for ${z.name}`, href: `/zones/${z.id}` })
      else if (st.freshness !== 'fresh')
        out.push({ id: `st-${z.id}`, level: 'warn', text: `${z.name}: readings out of date, check sensor`, href: `/zones/${z.id}`, at: st.lastUpdate })
    }
    for (const s of sensors) {
      const state = sensorState(s)
      if (state === 'offline') out.push({ id: `o-${s.id}`, level: 'alert', text: `Sensor ${s.name} offline (no signal for over 3 h)`, href: '/sensors', at: s.lastSeen })
      if (state === 'never') out.push({ id: `nv-${s.id}`, level: 'warn', text: `Sensor ${s.name} has not sent any readings`, href: '/sensors' })
      if (typeof s.batteryPercent === 'number' && s.batteryPercent < 20 && state !== 'never')
        out.push({ id: `b-${s.id}`, level: 'warn', text: `Sensor ${s.name} battery low (${s.batteryPercent}%)`, href: '/sensors', at: s.lastSeen })
    }
    const rain48 = weather.days.slice(0, 2).reduce((t, d) => t + Math.max(0, d.rainMm), 0)
    if (rain48 >= 10) out.push({ id: 'rain', level: 'info', text: `Heavy rain expected: ${Math.round(rain48)} mm in the next 48 h`, href: '/weather' })
    const rank = { alert: 0, warn: 1, info: 2 }
    return out.sort((a, b) => rank[a.level] - rank[b.level])
  }, [zones, sensors, weather, zoneStatus, sensorState])
}
