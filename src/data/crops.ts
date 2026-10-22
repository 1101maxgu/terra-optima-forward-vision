// PLACEHOLDER — Agent A replaces with cited values.
import type { Crop, CropId } from '../types'

export const CROPS: Record<CropId, Crop> = {
  tomato: { id: 'tomato', name: 'Tomatoes', kc: 1.15, rootDepthMm: 700, p: 0.4, source: 'TBD' },
  lettuce: { id: 'lettuce', name: 'Lettuce', kc: 1.0, rootDepthMm: 300, p: 0.3, source: 'TBD' },
  blueberry: { id: 'blueberry', name: 'Blueberries', kc: 1.05, rootDepthMm: 450, p: 0.5, source: 'TBD' },
}
