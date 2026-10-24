// Plan limits on the server. Numbers come from src/pricing/plans.ts, the same file the Pricing page shows.
// Downgrades never delete anything: zones and sensors past the limit (newest first) become read-only.
import { limitsFor, type Limits, type PlanId } from '../src/pricing/plans.js'
import type { Db } from './db.js'
import { HttpError } from './http.js'

const DAY = 86_400_000
const PAST_DUE_GRACE_DAYS = 7

export interface FarmPlan extends Limits {
  plan: PlanId
  status: string | null
  interval: 'month' | 'year' | null
  extraSensors: number
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

interface SubRow {
  status: string
  billing_interval: 'month' | 'year' | null
  extra_sensors: number
  current_period_end: Date | null
  cancel_at_period_end: boolean
}

/** Grower while Stripe says active/trialing, or past_due within a short grace; otherwise Free. */
export function planFromRow(row: SubRow | undefined, now: number): FarmPlan {
  const end = row?.current_period_end ? row.current_period_end.getTime() : null
  const paid = !!row && (row.status === 'active' || row.status === 'trialing' ||
    (row.status === 'past_due' && end !== null && now < end + PAST_DUE_GRACE_DAYS * DAY))
  const plan: PlanId = paid ? 'grower' : 'free'
  return {
    plan,
    ...limitsFor(plan, paid ? row.extra_sensors : 0),
    status: row?.status ?? null,
    interval: row?.billing_interval ?? null,
    extraSensors: row?.extra_sensors ?? 0,
    currentPeriodEnd: row?.current_period_end?.toISOString() ?? null,
    cancelAtPeriodEnd: row?.cancel_at_period_end ?? false,
  }
}

export async function planFor(db: Db, farmId: string, now: number): Promise<FarmPlan> {
  const [row] = await db<SubRow[]>`
    select status, billing_interval, extra_sensors, current_period_end, cancel_at_period_end from subscriptions where farm_id = ${farmId}`
  return planFromRow(row, now)
}

/** Connected sensors count toward the plan; manual "sensors" (typed-in readings) never do. */
export async function usage(db: Db, farmId: string) {
  const [u] = await db<{ zones: number; sensors: number }[]>`
    select (select count(*)::int from zones where farm_id = ${farmId}) as zones,
           (select count(*)::int from sensors where farm_id = ${farmId} and type <> 'manual') as sensors`
  return u
}

const limitError = (what: string) =>
  new HttpError(402, 'plan_limit', `The Free plan includes ${what}. Upgrade to Grower in Plans and pricing to add more.`)

export async function assertCanAddZone(db: Db, farmId: string, now: number) {
  const p = await planFor(db, farmId, now)
  if (p.zones === null) return
  if ((await usage(db, farmId)).zones >= p.zones) throw limitError(`${p.zones} zones`)
}

export async function assertCanAddSensors(db: Db, farmId: string, now: number, adding = 1) {
  const p = await planFor(db, farmId, now)
  if ((await usage(db, farmId)).sensors + adding <= p.sensors) return
  throw p.plan === 'free'
    ? limitError(`${p.sensors} connected sensor`)
    : new HttpError(402, 'plan_limit', `Your plan covers ${p.sensors} sensors. Add extra sensors from your account page.`)
}

/** Read-only check for writes that touch one zone (edits, readings, irrigation events). */
export async function assertZoneWritable(db: Db, farmId: string, zoneId: string | null | undefined, now: number) {
  if (!zoneId) return
  const p = await planFor(db, farmId, now)
  if (p.zones === null) return
  const [r] = await db<{ rank: number }[]>`
    select rank from (select id, row_number() over (order by created_at, id)::int as rank from zones where farm_id = ${farmId}) z
    where id = ${zoneId}`
  if (r && r.rank > p.zones) throw new HttpError(402, 'plan_read_only', 'This zone is read-only on the Free plan. Upgrade to Grower to edit it again.')
}

/** Ingest check: readings from sensors past the plan's allowance are not stored. */
export async function sensorAccepting(db: Db, farmId: string, sensorId: string, now: number): Promise<boolean> {
  const p = await planFor(db, farmId, now)
  const [r] = await db<{ rank: number }[]>`
    select rank from (select id, row_number() over (order by created_at, id)::int as rank from sensors
                      where farm_id = ${farmId} and type <> 'manual') s where id = ${sensorId}`
  return !r || r.rank <= p.sensors
}
