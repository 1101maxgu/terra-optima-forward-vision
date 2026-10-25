// Crop and soil reference library for the Season plan's detailed Luke answers. Numbers that the irrigation
// engine already uses come straight from crops.ts and soils.ts, so Luke and the advice cards never disagree.
// The stage values and field notes below are from FAO-56 (Table 12) and general good practice for these crops.
// To be reviewed by an agronomist before field use. See docs/sources.md.
import type { CropId } from '../types.js'
import { CROPS } from './crops.js'
import { EFFICIENCY } from './methods.js'
import { SOILS } from './soils.js'

interface CropNotes {
  kcIni: number // Kc, early growth (FAO-56 Table 12)
  kcEnd: number // Kc, end of season (FAO-56 Table 12)
  stages: string[] // what to do at each stage, in plain words
  stress: string // what the plant shows when it is short of water
  watch: string // common watering mistakes
}

const NOTES: Record<CropId, CropNotes> = {
  tomato: {
    kcIni: 0.6, kcEnd: 0.8,
    stages: [
      'After planting: water in well, then let the top soil dry a little so roots go deeper.',
      'Flowering and fruit set: keep the soil evenly moist. Big swings between dry and wet are the main trouble.',
      'Ripening: keep watering steady. A small cut near the end can sweeten fruit, but never let plants wilt.',
    ],
    stress: 'Leaves curl or droop in the afternoon and do not recover by morning; flowers drop.',
    watch: 'Swinging between very dry and very wet soil can crack fruit and cause blossom-end rot. Overhead water on leaves late in the day can invite disease.',
  },
  lettuce: {
    kcIni: 0.7, kcEnd: 0.95,
    stages: [
      'Seedlings: keep the top few centimetres moist. Roots are very shallow.',
      'Head growth: water little and often, because roots only reach about 30 cm.',
      'Before harvest: keep watering evenly so heads stay crisp.',
    ],
    stress: 'Leaves go limp at midday, edges turn brown, and the taste turns bitter.',
    watch: 'Lettuce dries out fast in hot weather. Skipping one day in a heat wave can hurt more than in other crops.',
  },
  strawberry: {
    kcIni: 0.4, kcEnd: 0.75,
    stages: [
      'After planting: keep the root ball moist while the plants settle in.',
      'Flowering and fruiting: keep the soil evenly moist. Water short of this size and berries stay small.',
      'After harvest: reduce, but do not let the plants dry out completely.',
    ],
    stress: 'Berries stay small, leaves look dull or grey-green, and runners stop growing.',
    watch: 'Roots are very shallow (about 20 cm), so the soil can dry quickly even when it looks fine below.',
  },
  blueberry: {
    kcIni: 0.3, kcEnd: 0.5,
    stages: [
      'Early spring: water only as needed. Cool weather uses little water.',
      'Fruit swelling and ripening (June to August in BC): this is when water matters most. Keep the soil evenly moist.',
      'After harvest: keep watering enough for the plants to build next year\'s buds.',
    ],
    stress: 'Berries stay small or shrivel, and leaf tips scorch in hot spells.',
    watch: 'Blueberry roots are fine and shallow, so they dry out faster than the soil around them. Drip lines near the plants work better than overhead water.',
  },
}

/** The reference text added to Luke's instructions for Season plan farms (and the demo farm). */
export function knowledgeText(): string {
  const crops = (Object.keys(CROPS) as CropId[]).map((id) => {
    const c = CROPS[id], n = NOTES[id]
    return [
      `### ${c.name}`,
      `Water use factor (Kc): ${n.kcIni} early, ${c.kc} at full growth, ${n.kcEnd} at season end. Roots reach about ${c.rootDepthMm / 10} cm. The plant can use up ${Math.round(c.p * 100)}% of the stored water before it gets stressed.`,
      ...n.stages.map((s) => `- ${s}`),
      `Signs of thirst: ${n.stress}`,
      `Watch out for: ${n.watch}`,
    ].join('\n')
  })
  const soils = Object.values(SOILS).map((s) => `- ${s.name}: holds about ${Math.round((s.fieldCapacity - s.wiltingPoint) * 1000)} mm of plant-available water per metre of soil.`)
  return [
    '## Crop and soil reference library',
    'Sources: FAO Irrigation and Drainage Paper 56 (Allen et al., 1998) and BC Ministry of Agriculture Water Conservation Factsheet 619.000-1. Reference values only. They have not been checked by an agronomist.',
    '',
    ...crops,
    '',
    '### Soils',
    ...soils,
    'Sandy soils dry fast and need smaller, more frequent watering. Silt loam holds water longest.',
    '',
    '### Watering methods',
    `- Drip: about ${Math.round(EFFICIENCY.drip * 100)}% of the water reaches the roots. Best for berries and tomatoes.`,
    `- Sprinkler: about ${Math.round(EFFICIENCY.sprinkler * 100)}% reaches the roots. Wind and midday heat lose more.`,
    'Water early morning or evening to lose less to the air.',
  ].join('\n')
}
