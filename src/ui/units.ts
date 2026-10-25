// Metric or acres and US gallons, chosen in Settings. The engine always works in mm, litres and m²;
// these helpers only change what the farmer reads.
import { formatArea } from '../map/geo'
import { useFarm } from '../state/farmStore'

export type Units = 'metric' | 'imperial'

const MM_PER_IN = 25.4
const L_PER_GAL = 3.785411784 // US gallon

const num = (n: number, digits = 0) => n.toLocaleString('en-CA', { maximumFractionDigits: digits, minimumFractionDigits: 0 })

/** Depth of water: "12 mm" or "0.47 in". */
export function fmtDepth(mm: number, u: Units): string {
  return u === 'metric' ? `${num(mm, 1)} mm` : `${num(mm / MM_PER_IN, 2)} in`
}

/** Volume of water: "34,220 L" or "9,040 gal". */
export function fmtVolume(litres: number, u: Units): string {
  return u === 'metric' ? `${num(Math.round(litres))} L` : `${num(Math.round(litres / L_PER_GAL))} gal`
}

export function fmtAreaU(m2: number, u: Units): string {
  return u === 'metric' ? formatArea(m2) : formatArea(m2, 'ac')
}

/** Rewrites "15 mm" and "34,220 L" inside engine sentences (summaries, timing, factors, alerts). */
export function localize(text: string, u: Units): string {
  if (u === 'metric') return text
  const n = (s: string) => Number(s.replace(/,/g, ''))
  return text
    .replace(/(\d[\d,]*(?:\.\d+)?)\s?mm\b/g, (_, v: string) => fmtDepth(n(v), u))
    .replace(/(\d[\d,]*(?:\.\d+)?)\s?L\b/g, (_, v: string) => fmtVolume(n(v), u))
}

export function useUnits() {
  const { units } = useFarm()
  return {
    units,
    depth: (mm: number) => fmtDepth(mm, units),
    volume: (litres: number) => fmtVolume(litres, units),
    area: (m2: number) => fmtAreaU(m2, units),
    text: (s: string) => localize(s, units),
  }
}
