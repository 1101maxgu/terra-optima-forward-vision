// All guide text lives here (plain data, no React) so the Help pages, Luke's offline search and the
// assistant's server prompt share one source. Draft for review: wording is mine, facts come from the code.

export type IconKey = 'start' | 'zones' | 'sensors' | 'advice' | 'weather' | 'hardware' | 'offline' | 'luke'

export interface Block {
  heading?: string
  body?: string
  steps?: string[]
  note?: { kind: 'pilot' | 'tip' | 'warn'; text: string }
}

export interface Topic {
  id: string
  title: string
  summary: string
  icon: IconKey
  blocks: Block[]
  /** Pre-filled question for the "Ask Luke about this" button. */
  askLuke: string
  /** Extra words people may type that the title/body don't contain (offline search). */
  keywords?: string[]
}

const PILOT = 'The Wi-Fi sensor has not been built or field-tested yet. Treat this as a preview, not a shopping list.'

export const TOPICS: Topic[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    summary: 'What GeoViva does and how to find your way around.',
    icon: 'start',
    askLuke: 'What can I do with GeoViva?',
    keywords: ['welcome', 'navigate', 'menu', 'home', 'sample', 'my farm', 'dataset'],
    blocks: [
      {
        body: 'GeoViva tells you which of your fields or beds to water, and when, using your soil moisture readings and the weather forecast.',
      },
      {
        heading: 'Finding your way around',
        steps: [
          'Home: your farm at a glance, with today’s watering advice, recent readings, the forecast and alerts.',
          'Zones: each field or bed with the same crop and soil. Tap one to see its advice, moisture chart and history.',
          'Sensors: every sensor and manual-reading source, and the place to add a new one.',
          'Weather: the forecast for your farm.',
          'Reports: how much water you applied, by zone.',
          'Settings (called “More” on a phone): farm details, weather source, and switching between Sample farm and My farm.',
        ],
      },
      {
        heading: 'Sample farm or My farm',
        body: 'The Sample farm is fictional, with simulated sensors, so you can explore safely. When you are ready, switch to My farm: on a laptop use the Dataset switch at the bottom of the left menu, on a phone use Settings.',
      },
      {
        heading: 'The four watering statuses',
        steps: [
          'Water today (red): the soil is at or below the refill level. Water now.',
          'Water soon (yellow): moisture is dropping. Plan to water in the next day or two.',
          'No watering needed (green): enough water in the soil.',
          'Check sensor (grey): the app cannot trust the data. See “Reading your advice”.',
        ],
      },
    ],
  },
  {
    id: 'zones',
    title: 'Creating your farm and zones',
    summary: 'Draw a field on the map and tell GeoViva what grows there.',
    icon: 'zones',
    askLuke: 'How do I create a zone?',
    keywords: ['field', 'bed', 'boundary', 'draw', 'map', 'crop', 'soil', 'wizard', 'area'],
    blocks: [
      {
        body: 'A zone is one field or bed with the same crop, soil and watering method. Advice is given per zone, so keep zones uniform.',
      },
      {
        heading: 'Create a zone',
        steps: [
          'Open Zones and tap “Create new zone”.',
          'Location: search for your farm or move the map to it.',
          'Draw: tap points around the edge of the field, then finish the shape. Satellite view helps you see the field edges.',
          'Details: name the zone and choose the crop, soil and watering method.',
          'Sensors: connect a sensor, or choose manual readings if you have no hardware.',
          'Review: check everything and save. Your progress is saved on the phone if you get interrupted.',
        ],
      },
      {
        heading: 'Fix a boundary',
        steps: ['Open the zone.', 'Choose to edit the boundary.', 'Drag the corner points, then save.'],
      },
      {
        note: { kind: 'tip', text: 'The map needs a connection. If you are in the field with no signal, draw the zone later from home or the office.' },
      },
    ],
  },
  {
    id: 'sensors',
    title: 'Sensors and readings',
    summary: 'Add sensors, type in readings, or import a spreadsheet.',
    icon: 'sensors',
    askLuke: 'How do I add a sensor or enter a reading?',
    keywords: ['lorawan', 'wifi', 'esp32', 'manual', 'csv', 'import', 'claim', 'reading', 'moisture'],
    blocks: [
      {
        body: 'You do not need hardware. Typing in a reading by hand works the same as a sensor reading.',
      },
      {
        heading: 'Enter a reading by hand',
        steps: [
          'Open the zone and go to its moisture tab.',
          'Enter the soil moisture (%). Soil temperature is optional.',
          'Save. The advice updates straight away.',
        ],
      },
      {
        heading: 'Add a sensor',
        steps: [
          'Open Sensors and tap “Add sensor”.',
          'Pick how it connects: “Existing LoRaWAN network”, “GeoViva Wi-Fi sensor” or “Manual readings”.',
          'LoRaWAN: choose your region, enter your The Things Stack details, then pick the devices to import.',
          'Wi-Fi sensor: type the device code printed on the sensor’s label to claim it.',
          'Assign the sensor to a zone, and set its depth and location if asked.',
        ],
      },
      {
        heading: 'Import a spreadsheet (CSV)',
        body: 'Have readings in a spreadsheet? Open Settings, find the CSV import, and follow the prompts. Save your spreadsheet as CSV first. A sample file is included to show the layout.',
      },
      {
        heading: 'Sensor list colours',
        steps: ['Green dot: online.', 'Blue dot: manual readings.', 'Red dot: offline.', 'Grey dot: stale or unknown.'],
      },
    ],
  },
  {
    id: 'advice',
    title: 'Reading your advice',
    summary: 'What the statuses mean and why GeoViva says what it says.',
    icon: 'advice',
    askLuke: 'Why does my zone say Water today?',
    keywords: ['recommendation', 'why', 'irrigation', 'water today', 'water soon', 'check sensor', 'stale', 'field capacity', 'refill'],
    blocks: [
      {
        heading: 'Recommendation card',
        body: 'Open a zone to see its status, how much to apply, and the “Why this recommendation” list. Each line shows a factor (like soil moisture, rain forecast or crop stage) with an arrow: ↑ raises the need to water, ↓ lowers it, → makes no difference. A badge shows where each number came from.',
      },
      {
        heading: 'The moisture chart',
        body: 'The dotted blue line is field capacity (soil is full). The dotted red line is the refill level. When moisture falls to the red line, it is time to water.',
      },
      {
        heading: 'If it says “Check sensor”',
        steps: [
          'The zone has no readings yet: add a manual reading or connect a sensor.',
          'The latest reading is too old to trust: take a new reading or check the sensor.',
          'A sensor in the zone is offline: see Hardware, “Troubleshooting”.',
        ],
      },
      {
        note: { kind: 'tip', text: 'GeoViva gives guidance based on a standard water-balance method. You know your fields best: if the soil looks or feels different, trust your eyes and take a reading.' },
      },
    ],
  },
  {
    id: 'weather-reports',
    title: 'Weather and reports',
    summary: 'Forecast, and how much water you have used.',
    icon: 'weather',
    askLuke: 'How do I see how much water I used?',
    keywords: ['forecast', 'rain', 'report', 'water applied', 'litres', 'mm', 'log irrigation'],
    blocks: [
      {
        heading: 'Weather',
        body: 'Rain and hot, dry days both feed into every recommendation. In Settings, under “Weather source”, choose “Sample July week” (a fixed typical summer week, works offline) or “Live forecast” (the real forecast for your farm, needs a connection). Set your farm location in Settings so the live forecast is for the right place.',
      },
      {
        heading: 'Log the water you applied',
        steps: ['Open the zone and go to its irrigation tab.', 'Enter the amount, in mm or litres.', 'Add a note if you like, then save.'],
      },
      {
        heading: 'Reports',
        body: 'Reports adds up the water you logged, with a breakdown by zone, so you can see where it goes.',
      },
    ],
  },
  {
    id: 'hardware',
    title: 'Hardware: install and troubleshoot',
    summary: 'Putting a soil sensor in the ground, and fixing it when readings look wrong.',
    icon: 'hardware',
    askLuke: 'How do I install a soil sensor?',
    keywords: ['probe', 'install', 'bury', 'depth', 'battery', 'wifi', 'wi-fi', 'lorawan', 'gateway', 'offline', 'no readings', 'esp32', 'firmware', 'claim code', 'troubleshoot', 'wiring'],
    blocks: [
      { note: { kind: 'pilot', text: PILOT } },
      {
        heading: 'Which sensor?',
        steps: [
          'LoRaWAN: sensors that talk over a long-range radio network. You need a gateway in range, and a The Things Stack account. GeoViva imports the devices you already have.',
          'GeoViva Wi-Fi sensor (ESP32): talks over your farm Wi-Fi. Needs Wi-Fi signal where it is installed.',
          'No hardware: use manual readings.',
        ],
      },
      {
        heading: 'Where to put a sensor',
        steps: [
          'Choose a spot that is typical of the zone, not the wettest corner or next to a drip emitter or sprinkler.',
          'One sensor per zone is the minimum. Zones with mixed soil need more, or should be split.',
          'Put it in the crop’s root zone. The app records the depth, 15 cm by default for the Wi-Fi sensor.',
          'Keep it within signal range: Wi-Fi sensors need Wi-Fi, LoRaWAN sensors need a gateway.',
        ],
      },
      {
        heading: 'Installing in the ground',
        steps: [
          'Dig a hole or slot to the depth you chose. A narrow slot is better than a wide hole.',
          'Press the probe in until its sensing part is completely covered, with no air gaps against the soil. Gaps give false dry readings.',
          'Do not force or bend the probe. If you hit a stone, move the hole a little.',
          'Back-fill with the same soil and press it down gently. Water lightly so the soil settles around the probe.',
          'Keep the electronics and the cable joints above ground and out of standing water. Shade the unit from direct sun if you can.',
          'Mark the spot with a stake so it is not hit by machinery or a hoe.',
        ],
      },
      {
        heading: 'Connect it in GeoViva',
        steps: [
          'Open Sensors, tap “Add sensor”.',
          'LoRaWAN: choose “Existing LoRaWAN network”, then follow the prompts to import your devices.',
          'Wi-Fi sensor: choose “GeoViva Wi-Fi sensor” and enter the claim code on its label.',
          'Assign it to its zone and set its depth. Optionally set its location on the map.',
          'Wait for the first reading. The Wi-Fi sensor reports about every 15 minutes.',
        ],
      },
      {
        heading: 'Pilot: the Wi-Fi sensor build',
        body: 'The example design is an ESP32 board, a capacitive soil moisture probe on an analog pin, a DS18B20 waterproof temperature probe with a 4.7 kΩ resistor to 3.3 V, and an optional battery (through a voltage divider). It wakes every 15 minutes, takes a reading, sends it and goes back to deep sleep to save the battery. It must be calibrated: note the raw reading in air and in a cup of water, then ideally check against a soil sample from your own field. The code is in the project’s firmware folder.',
        note: { kind: 'pilot', text: PILOT },
      },
      {
        heading: 'Troubleshooting: no readings at all',
        steps: [
          'Check the sensor is switched on and the battery is charged.',
          'Wi-Fi sensor: is your Wi-Fi reaching it? Try a phone at the same spot. Check the Wi-Fi name and password it was set up with.',
          'Wi-Fi sensor: did you claim it with the label code? Until claimed, it cannot send data.',
          'LoRaWAN: check the gateway is online in The Things Stack and that the device is registered.',
          'Wait one full reporting period (about 15 minutes) before concluding it is broken.',
        ],
      },
      {
        heading: 'Troubleshooting: the reading looks wrong',
        steps: [
          'Always dry: gaps around the probe or it is too shallow. Reinstall with firm soil contact.',
          'Always wet: water pooling at the probe, or a damaged cable or seal. Move it or replace it.',
          'Jumping up and down: loose cable or poor battery. Check connections.',
          'Does not match your hand feel: it needs calibrating for your soil. Compare with a manual reading.',
        ],
      },
      {
        heading: 'Troubleshooting: the battery drains fast',
        steps: [
          'Weak Wi-Fi or radio signal makes the sensor try longer. Move closer, or add a repeater or gateway.',
          'Heat reduces battery life. Shade the unit.',
          'Replace or recharge the battery. The battery % shows in the Sensors list.',
        ],
      },
      {
        heading: 'Troubleshooting: “Check sensor” or red dot',
        steps: [
          'Open Sensors: how long ago was it last seen?',
          'Stale or offline: go through “no readings at all” above.',
          'Meanwhile, add a manual reading so you still get advice.',
        ],
      },
    ],
  },
  {
    id: 'offline',
    title: 'Without signal, and your data',
    summary: 'What works with no connection, and where your information is kept.',
    icon: 'offline',
    askLuke: 'What works without internet?',
    keywords: ['offline', 'no signal', 'internet', 'privacy', 'data', 'storage', 'saved', 'backup'],
    blocks: [
      {
        heading: 'Works with no signal',
        steps: [
          'This guide, once you have opened the app with a connection at least once.',
          'Your saved zones, sensors and readings on this phone.',
          'Typing in manual readings.',
        ],
      },
      {
        heading: 'Needs a connection',
        steps: [
          'Map and satellite images.',
          'The weather forecast.',
          'Asking Luke questions. Without signal Luke searches this guide for you instead.',
          'Sensors that send data over Wi-Fi or radio.',
        ],
      },
      {
        heading: 'Where your data lives',
        body: 'Until your farm account is set up, your farm information is stored in this browser on this device. If you clear the browser’s data or switch devices, it will not come with you. The Sample farm is fictional and is never mixed with your own data.',
      },
    ],
  },
  {
    id: 'ask-luke',
    title: 'Ask Luke, and glossary',
    summary: 'Luke answers questions about the app and your farm’s advice.',
    icon: 'luke',
    askLuke: 'What can you help me with?',
    keywords: ['assistant', 'chat', 'help', 'glossary', 'terms', 'definition', 'vwc', 'field capacity'],
    blocks: [
      {
        heading: 'Luke',
        body: 'Luke is the little leaf in the corner of the screen. Tap him to ask a question. He can explain how the app works and why a zone has the status it does. He cannot change anything, and he is not an agronomist: for crop decisions, ask your local extension office or advisor.',
      },
      {
        heading: 'Words you may see',
        steps: [
          'Zone: one field or bed with the same crop and soil.',
          'Soil moisture (%): how much water the soil holds, as a percentage of its volume.',
          'Field capacity: the most water the soil can hold after draining. A full soil.',
          'Refill level: the moisture where plants start to struggle and you should water.',
          'mm: millimetres of water over the ground. 1 mm over 1 m² is 1 litre.',
          'Stale: a reading that is too old to rely on.',
          'LoRaWAN: a long-range, low-power radio network for sensors.',
          'Gateway: the box that picks up LoRaWAN sensor signals and passes them online.',
          'Claim code: the code on a Wi-Fi sensor’s label that links it to your farm.',
        ],
      },
    ],
  },
]

export const topicById = (id: string) => TOPICS.find((t) => t.id === id)

const flat = (t: Topic) =>
  [t.title, t.summary, ...(t.keywords ?? []), ...t.blocks.flatMap((b) => [b.heading ?? '', b.body ?? '', ...(b.steps ?? []), b.note?.text ?? ''])]
    .join(' ')
    .toLowerCase()

/** Offline search: rank topics by how many query words appear (title hits count extra). */
export function searchTopics(query: string): Topic[] {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2)
  if (words.length === 0) return []
  return TOPICS.map((t) => {
    const text = flat(t)
    const title = t.title.toLowerCase()
    const score = words.reduce((n, w) => n + (text.includes(w) ? 1 : 0) + (title.includes(w) ? 2 : 0), 0)
    return { t, score }
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.t)
}
