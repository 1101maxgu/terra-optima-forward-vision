// Application efficiency by watering method (water reaching the root zone / water pumped). See docs/sources.md.
import type { IrrigationMethod } from '../types.js'

export const EFFICIENCY: Record<IrrigationMethod, number> = { drip: 0.9, sprinkler: 0.75 }
