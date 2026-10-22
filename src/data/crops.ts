// Crop constants. See docs/sources.md for how each value was chosen.
// To be reviewed by an agronomist before field use.
import type { Crop, CropId } from '../types'

export const CROPS: Record<CropId, Crop> = {
  tomato: {
    id: 'tomato',
    name: 'Tomatoes',
    kc: 1.15,
    rootDepthMm: 700,
    p: 0.4,
    source: 'FAO-56 (Allen et al. 1998): Kc mid 1.15 (Table 12); root depth 0.7 m, low end of 0.7–1.5 m used for irrigation scheduling, and p 0.40 (Table 22). BC Factsheet 619.000-1 also gives 40% availability for tomatoes.',
  },
  lettuce: {
    id: 'lettuce',
    name: 'Lettuce',
    kc: 1.0,
    rootDepthMm: 300,
    p: 0.3,
    source: 'FAO-56 (Allen et al. 1998): Kc mid 1.00 (Table 12); root depth 0.3 m, low end of 0.3–0.5 m, and p 0.30 (Table 22).',
  },
  blueberry: {
    id: 'blueberry',
    name: 'Blueberries',
    kc: 1.05,
    rootDepthMm: 600,
    p: 0.5,
    source: 'BC Factsheet 619.000-1 (BC Min. of Agriculture, 2002): blueberry rooting depth 0.60 m, availability coefficient 50% ("other crops"). Matches FAO-56 berries (bushes): 0.6–1.2 m, p 0.50 (Table 22). Kc mid 1.05 is FAO-56 berries (bushes), Table 12.',
  },
}
