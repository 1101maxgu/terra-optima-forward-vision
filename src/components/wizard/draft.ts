// Create-Zone wizard state: pure helpers (serialization, step validation, zone building).
import type { CropId, GeoPolygon, IrrigationMethod, Sensor, SoilId, Zone } from '../../types'
import { polygonAreaM2, validatePolygon } from '../../map/geo'
import type { LngLat } from '../../map'

export const DRAFT_KEY = 'geoviva:zone-draft'
export const STEPS = ['Location', 'Draw', 'Details', 'Sensors', 'Review'] as const
export type ConnectMethod = 'lorawan' | 'esp32' | 'manual'

export interface WizardDraft {
  v: 1
  step: number // index into STEPS
  location: { center: LngLat; zoom: number; label?: string }
  boundary: GeoPolygon | null
  skipBoundary: boolean // farmer chose to enter the area by hand (e.g. map unavailable)
  manualAreaM2: number | null
  name: string
  cropId: CropId
  soilId: SoilId
  method: IrrigationMethod
  rootDepthMm: number | null // null = crop default
  efficiencyPct: number | null // null = method default
  notes: string
  sensorMethod: ConnectMethod | null
  sensorIds: string[] // existing store sensors to assign
  pendingSensors: Sensor[] // registered/claimed via the server during this wizard, assigned on create
  manualReadingPct: number | null
}

export function newDraft(center: LngLat, name: string): WizardDraft {
  return {
    v: 1, step: 0, location: { center, zoom: 16 }, boundary: null, skipBoundary: false, manualAreaM2: null,
    name, cropId: 'tomato', soilId: 'loam', method: 'drip', rootDepthMm: null, efficiencyPct: null, notes: '',
    sensorMethod: null, sensorIds: [], pendingSensors: [], manualReadingPct: null,
  }
}

/** Parses a stored draft; returns null for anything malformed so a bad entry never crashes the page. */
export function parseDraft(raw: string | null): WizardDraft | null {
  if (!raw) return null
  try {
    const d = JSON.parse(raw) as Partial<WizardDraft>
    if (d?.v !== 1 || !Array.isArray(d.location?.center) || typeof d.name !== 'string') return null
    const base = newDraft(d.location.center as LngLat, d.name)
    const merged = { ...base, ...d } as WizardDraft
    merged.step = Math.min(Math.max(0, Math.floor(Number(merged.step) || 0)), STEPS.length - 1)
    return merged
  } catch {
    return null
  }
}

export const serializeDraft = (d: WizardDraft) => JSON.stringify(d)

/** Area from the polygon when there is one, else the manual area. */
export function draftArea(d: WizardDraft): number | null {
  if (d.skipBoundary) return d.manualAreaM2
  return d.boundary && !validatePolygon(d.boundary) ? polygonAreaM2(d.boundary) : null
}

/** Why the farmer can't leave this step yet, or null if they can. */
export function stepError(d: WizardDraft, step: number): string | null {
  if (step === 1) return d.skipBoundary ? null : validatePolygon(d.boundary)
  if (step === 2) {
    if (!d.name.trim()) return 'Give the field section a name.'
    const a = draftArea(d)
    if (!a || a <= 0) return 'Enter the field section area.'
    if (d.rootDepthMm !== null && !(d.rootDepthMm >= 50 && d.rootDepthMm <= 3000)) return 'Root depth should be between 50 and 3000 mm.'
    if (d.efficiencyPct !== null && !(d.efficiencyPct >= 30 && d.efficiencyPct <= 100)) return 'Efficiency should be between 30% and 100%.'
  }
  if (step === 3 && d.manualReadingPct !== null && !(d.manualReadingPct >= 0 && d.manualReadingPct <= 100))
    return 'Soil moisture should be between 0 and 100%.'
  return null
}

/** First step (up to `upTo`) that blocks progress, or -1 if all earlier steps are complete. */
export function firstInvalidStep(d: WizardDraft, upTo: number = STEPS.length): number {
  for (let s = 0; s < upTo; s++) if (stepError(d, s)) return s
  return -1
}

export function buildZone(d: WizardDraft): Omit<Zone, 'id' | 'farmId'> {
  const z: Omit<Zone, 'id' | 'farmId'> = {
    name: d.name.trim(), cropId: d.cropId, soilId: d.soilId, method: d.method,
    areaM2: Math.round(draftArea(d) ?? 0),
    boundary: d.skipBoundary ? null : d.boundary,
    createdAt: new Date().toISOString(),
  }
  if (d.rootDepthMm !== null) z.rootDepthMm = d.rootDepthMm
  if (d.efficiencyPct !== null) z.efficiency = d.efficiencyPct / 100
  if (d.notes.trim()) z.notes = d.notes.trim()
  return z
}
