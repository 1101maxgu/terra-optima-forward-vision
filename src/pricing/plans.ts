// Every price, limit and policy line for GeoViva lives here: the Pricing page, its calculator, the Help
// guide (and so Luke) and the server's plan limits all read this file. Plain data, no React.
// DRAFT: numbers in CAD, excluding tax. Change them here and everything follows.

export const PRICES_ARE_DRAFT = true
export const CURRENCY = 'CAD'
export const CONTACT_EMAIL = 'hello@geoviva.example' // placeholder

// 'grower' is the stored id of the paid plan (database rows and server routes use it). Farmers see it as the Season plan.
export type PlanId = 'free' | 'grower'
export const PLAN_NAME: Record<PlanId, string> = { free: 'Free', grower: 'Season plan' }

const NO_CAP = 1000 // "as many as you like": a number so it travels through JSON

export const FREE = {
  zones: NO_CAP,
  sensors: NO_CAP, // sensors you rent from us or bring yourself; manual readings and CSV are always free
  farms: 1,
  historyDays: 30,
  reportDays: 7, // Reports page: last 7 days only
}

/** The paid plan: one price per farm for one season. Sensors are rented on top, on any plan. */
export const SEASON = {
  price: 100, // per farm, per season
  months: 4, // a season is 4 months
  historyDays: 365,
  reportDays: 30,
  textsPerMonth: 300, // fair-use limit on text alerts
}

export const RENTAL = {
  price: 50, // per sensor, per season
  replacementFee: 99, // charged only if a sensor isn't sent back
  returnDays: 30, // after the season ends
}

export interface Limits {
  zones: number | null // null = unlimited
  sensors: number
  historyDays: number
  reportDays: number // longest Reports period
  assistant: boolean // Luke, the AI assistant
  textAlerts: boolean
}

export function limitsFor(plan: PlanId): Limits {
  return plan === 'free'
    ? { zones: null, sensors: FREE.sensors, historyDays: FREE.historyDays, reportDays: FREE.reportDays, assistant: false, textAlerts: false }
    : { zones: null, sensors: NO_CAP, historyDays: SEASON.historyDays, reportDays: SEASON.reportDays, assistant: true, textAlerts: true }
}

export interface CostInput {
  season: boolean // wants the Season plan (AI assistant and text alerts)
  sensors: number // sensors to rent from GeoViva
}

export interface CostLine {
  label: string
  amount: number
}

export interface CostEstimate {
  lines: CostLine[]
  total: number
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Cost for one season in CAD, excluding tax. */
export function estimateCost({ season, sensors }: CostInput): CostEstimate {
  sensors = Math.max(0, Math.floor(sensors))
  const lines: CostLine[] = []
  if (season) lines.push({ label: `Season plan (${SEASON.months} months)`, amount: SEASON.price })
  if (sensors) lines.push({ label: `${plural(sensors, 'sensor')} to rent at ${money(RENTAL.price)}`, amount: sensors * RENTAL.price })
  return { lines, total: lines.reduce((n, l) => n + l.amount, 0) }
}

/** The fixed example on the Pricing page: a small farm with 3 sensors. */
export const WORKED_EXAMPLE: CostInput = { season: true, sensors: 3 }

export const money = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`)

export const POLICIES = [
  `All prices are in Canadian dollars and do not include GST/PST. The exact tax is shown before you pay.`,
  `The Season plan covers one season of ${SEASON.months} months. It does not renew by itself. We ask you before the next season.`,
  `You rent sensors. We ship them to you, and the shipping is already in the ${money(RENTAL.price)}. You never have to buy the hardware.`,
  `Send each sensor back within ${RENTAL.returnDays} days after the season ends. If a sensor is not sent back, we charge a replacement fee of ${money(RENTAL.replacementFee)}.`,
  `The Free plan stays free. Nothing is deleted when a season ends.`,
  `Text alerts have a fair-use limit of about ${SEASON.textsPerMonth} texts a month. Normal farms never come close.`,
]

export const SPONSORED_LINE = `Community gardens and food-security farms can use GeoViva free, at any size. Email ${CONTACT_EMAIL} to apply.`
