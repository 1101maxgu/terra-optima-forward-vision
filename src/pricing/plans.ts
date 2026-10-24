// Every price, limit and policy line for GeoViva lives here: the Pricing page, its calculator, the Help
// guide (and so Luke) and the server's plan limits all read this file. Plain data, no React.
// DRAFT: placeholder numbers in CAD, excluding tax. Change them here and everything follows.

export const PRICES_ARE_DRAFT = true
export const CURRENCY = 'CAD'
export const CONTACT_EMAIL = 'hello@geoviva.example' // placeholder

export type PlanId = 'free' | 'grower'
export type Billing = 'monthly' | 'yearly'

export const FREE = {
  zones: 2,
  sensors: 1, // connected sensors (ours or third-party); manual readings and CSV are always free
  farms: 1,
  historyDays: 30,
}

export const GROWER = {
  monthly: 8,
  yearly: 80, // 10 months' price: 2 months free
  sensorsIncluded: 3,
  historyDays: 365,
}

export const EXTRA_SENSOR = { monthly: 3, yearly: 30 }

export const SENSOR = {
  price: 99, // GeoViva Wi-Fi soil sensor
  partsCost: 95, // parts list in docs/PRD.md before shipping and contingency
  shipping: 12, // flat per order, anywhere in Canada
  returnDays: 30,
}

export const BUNDLE = {
  price: 349,
  sensors: 3,
  // Includes the first year of Grower, billed yearly.
}

/** What the bundle would cost bought separately. */
export const bundleListPrice = BUNDLE.sensors * SENSOR.price + GROWER.yearly

export interface Limits {
  zones: number | null // null = unlimited
  sensors: number
  historyDays: number
  reports: boolean
}

/** Limits for a plan; Grower's sensor allowance grows with paid extra sensors. */
export function limitsFor(plan: PlanId, extraSensors = 0): Limits {
  return plan === 'free'
    ? { zones: FREE.zones, sensors: FREE.sensors, historyDays: FREE.historyDays, reports: false }
    : { zones: null, sensors: GROWER.sensorsIncluded + Math.max(0, extraSensors), historyDays: GROWER.historyDays, reports: true }
}

export const needsGrower = (zones: number, sensors: number) => zones > FREE.zones || sensors > FREE.sensors

/** How the farmer gets sensors: already owns them, buys ours one by one, or buys the Starter bundle. */
export type Hardware = 'own' | 'buy' | 'bundle'

export interface CostInput {
  zones: number
  sensors: number
  billing: Billing
  hardware: Hardware
}

export interface CostLine {
  label: string
  amount: number
}

export interface CostEstimate {
  plan: PlanId
  firstYear: CostLine[]
  firstYearTotal: number
  laterYears: CostLine[]
  laterYearTotal: number
}

const sum = (lines: CostLine[]) => lines.reduce((n, l) => n + l.amount, 0)
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Year-one and following-year cost in CAD, excluding tax. */
export function estimateCost({ zones, sensors, billing, hardware }: CostInput): CostEstimate {
  zones = Math.max(0, Math.floor(zones))
  sensors = Math.max(0, Math.floor(sensors))
  const bundle = hardware === 'bundle'
  const plan: PlanId = bundle || needsGrower(zones, sensors) ? 'grower' : 'free'
  const extras = plan === 'grower' ? Math.max(0, sensors - GROWER.sensorsIncluded) : 0

  const software: CostLine[] = []
  if (plan === 'grower') {
    software.push(billing === 'yearly'
      ? { label: 'Grower plan, yearly', amount: GROWER.yearly }
      : { label: `Grower plan, ${money(GROWER.monthly)} × 12 months`, amount: GROWER.monthly * 12 })
    if (extras)
      software.push(billing === 'yearly'
        ? { label: `${plural(extras, 'extra sensor')}, yearly`, amount: extras * EXTRA_SENSOR.yearly }
        : { label: `${plural(extras, 'extra sensor')}, ${money(EXTRA_SENSOR.monthly)} × 12 months`, amount: extras * EXTRA_SENSOR.monthly * 12 })
  }

  const firstYear: CostLine[] = []
  if (bundle) {
    firstYear.push({ label: `Starter bundle (${BUNDLE.sensors} sensors + first year of Grower)`, amount: BUNDLE.price })
    const more = Math.max(0, sensors - BUNDLE.sensors)
    if (more) firstYear.push({ label: `${plural(more, 'more sensor')} at ${money(SENSOR.price)}`, amount: more * SENSOR.price })
    firstYear.push(...software.slice(1)) // the bundle already covers the base plan
  } else {
    if (hardware === 'buy' && sensors) firstYear.push({ label: `${plural(sensors, 'sensor')} at ${money(SENSOR.price)}`, amount: sensors * SENSOR.price })
    firstYear.push(...software)
  }
  if (hardware !== 'own' && (bundle || sensors)) firstYear.push({ label: 'Shipping', amount: SENSOR.shipping })

  return { plan, firstYear, firstYearTotal: sum(firstYear), laterYears: software, laterYearTotal: sum(software) }
}

/** The fixed example on the Pricing page: a typical 4-bed market garden. */
export const WORKED_EXAMPLE: CostInput = { zones: 4, sensors: 4, billing: 'yearly', hardware: 'bundle' }

export const money = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`)

export const POLICIES = [
  `All prices are in Canadian dollars and do not include GST/PST. The exact tax is shown before you pay.`,
  `Sensor shipping is a flat ${money(SENSOR.shipping)} per order anywhere in Canada.`,
  `No contract. Cancel any time: your plan stays active until the end of the month or year you have paid for, then ends. There are no refunds for the unused part of a period.`,
  `If your plan ends, your farm moves to the Free plan. Nothing is deleted: zones and sensors above the free limits become read-only until you upgrade again.`,
  `Unopened sensors can be returned within ${SENSOR.returnDays} days for a full refund.`,
]

export const SPONSORED_LINE = `Community gardens and food-security farms can use GeoViva free, at any size. Email ${CONTACT_EMAIL} to apply.`
