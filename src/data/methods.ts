// Application efficiency by watering method (water reaching the root zone / water pumped). See docs/sources.md.
import type { IrrigationMethod } from '../types.js'

export const EFFICIENCY: Record<IrrigationMethod, number> = { drip: 0.9, sprinkler: 0.75 }

/** Typical application rate (mm of water per hour) used for "run it for about N hours". An estimate until the
 * farmer's own system is measured; see docs/sources.md. */
export const APPLICATION_RATE_MM_PER_H: Record<IrrigationMethod, number> = { drip: 3, sprinkler: 10 }

/** Hours to run the system for a gross depth, rounded to the nearest half hour (at least half an hour). */
export function runHours(grossMm: number, method: IrrigationMethod): number {
  return Math.max(0.5, Math.round((grossMm / APPLICATION_RATE_MM_PER_H[method]) * 2) / 2)
}

/** "Run your drip system for about 3 hours", or per watering when a big amount is split into several. */
export const runText = (grossMm: number, method: IrrigationMethod, sessions = 1) => {
  const h = runHours(grossMm / Math.max(1, sessions), method)
  const run = `Run your ${method === 'drip' ? 'drip' : 'sprinkler'} system for about ${h} hour${h === 1 ? '' : 's'}`
  return sessions > 1 ? `${run}, ${sessions} separate times` : run
}
