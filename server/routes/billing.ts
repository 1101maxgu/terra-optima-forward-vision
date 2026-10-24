// Grower subscriptions through Stripe. The farmer pays on Stripe Checkout and manages or cancels in the
// Stripe Customer Portal (configured to cancel at period end only). Our database learns about changes only
// from the signed webhook, so a tampered browser can never grant itself a plan.
import Stripe from 'stripe'
import { z } from 'zod'
import { requireMember } from '../auth.js'
import type { BillingConfig } from '../config.js'
import type { Ctx } from '../context.js'
import type { Db } from '../db.js'
import { planFor, usage } from '../entitlements.js'
import { HttpError, json, parse, readText } from '../http.js'

const checkoutBody = z.object({
  billing: z.enum(['monthly', 'yearly']),
  extraSensors: z.number().int().min(0).max(50).default(0),
})

let cached: { key: string; client: Stripe } | undefined
function stripeFor(ctx: Ctx): { stripe: Stripe; cfg: BillingConfig } {
  const cfg = ctx.deps.config.billing
  if (!cfg) throw new HttpError(503, 'billing_not_configured', 'Payments are not switched on yet.')
  if (ctx.deps.stripe) return { stripe: ctx.deps.stripe, cfg }
  if (cached?.key !== cfg.stripeSecretKey) cached = { key: cfg.stripeSecretKey, client: new Stripe(cfg.stripeSecretKey) }
  return { stripe: cached.client, cfg }
}

/** Current plan, renewal date and usage, for the account page. */
export async function getBilling(ctx: Ctx) {
  const { db } = ctx.deps
  const farmId = ctx.params.farmId
  await requireMember(db, await ctx.user(), farmId, 'viewer')
  const [plan, used] = await Promise.all([planFor(db, farmId, ctx.deps.now()), usage(db, farmId)])
  return json(200, { ...plan, usage: used, billingEnabled: Boolean(ctx.deps.config.billing) })
}

export async function createCheckout(ctx: Ctx) {
  const { db } = ctx.deps
  const farmId = ctx.params.farmId
  const user = await ctx.user()
  await requireMember(db, user, farmId, 'owner')
  const { stripe, cfg } = stripeFor(ctx)
  const input = parse(checkoutBody, await ctx.body())
  const [existing] = await db<{ stripe_customer_id: string; status: string }[]>`
    select stripe_customer_id, status from subscriptions where farm_id = ${farmId}`
  if (existing && ['active', 'trialing', 'past_due'].includes(existing.status))
    throw new HttpError(409, 'already_subscribed', 'This farm already has Grower. Use “Manage plan” to change it.')

  const yearly = input.billing === 'yearly'
  const items: Stripe.Checkout.SessionCreateParams.LineItem[] = [{ price: yearly ? cfg.prices.growerYearly : cfg.prices.growerMonthly, quantity: 1 }]
  if (input.extraSensors) items.push({ price: yearly ? cfg.prices.sensorYearly : cfg.prices.sensorMonthly, quantity: input.extraSensors })

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: items,
    client_reference_id: farmId,
    subscription_data: { metadata: { farm_id: farmId } },
    ...(existing
      ? { customer: existing.stripe_customer_id, customer_update: { address: 'auto' as const, name: 'auto' as const } }
      : { customer_email: user.email }),
    automatic_tax: { enabled: true }, // GST/PST calculated by Stripe Tax and shown before paying
    billing_address_collection: 'required',
    success_url: `${cfg.appUrl}/#/account?checkout=done`,
    cancel_url: `${cfg.appUrl}/#/pricing`,
  })
  if (!session.url) throw new HttpError(502, 'checkout_failed', 'Could not start checkout. Try again.')
  return json(201, { url: session.url })
}

/** Stripe Customer Portal: change card, add or remove extra sensors, cancel (at period end), invoices. */
export async function createPortal(ctx: Ctx) {
  const { db } = ctx.deps
  const farmId = ctx.params.farmId
  await requireMember(db, await ctx.user(), farmId, 'owner')
  const { stripe, cfg } = stripeFor(ctx)
  const [sub] = await db<{ stripe_customer_id: string }[]>`select stripe_customer_id from subscriptions where farm_id = ${farmId}`
  if (!sub) throw new HttpError(404, 'no_subscription', 'This farm is on the Free plan.')
  const session = await stripe.billingPortal.sessions.create({ customer: sub.stripe_customer_id, return_url: `${cfg.appUrl}/#/account` })
  return json(201, { url: session.url })
}

/** Writes Stripe's view of a subscription into our table. */
async function saveSubscription(db: Db, sub: Stripe.Subscription, cfg: BillingConfig, farmIdHint?: string | null) {
  const farmId = sub.metadata?.farm_id || farmIdHint
  if (!farmId) {
    console.error('Stripe subscription without farm_id metadata', sub.id)
    return
  }
  const sensorPrices = new Set([cfg.prices.sensorMonthly, cfg.prices.sensorYearly])
  const items = sub.items.data
  const extra = items.filter((i) => sensorPrices.has(i.price.id)).reduce((n, i) => n + (i.quantity ?? 0), 0)
  const interval = items[0]?.price.recurring?.interval
  const periodEnd = Math.max(0, ...items.map((i) => i.current_period_end ?? 0))
  const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
  const row = {
    farm_id: farmId,
    stripe_customer_id: customer,
    stripe_subscription_id: sub.id,
    status: sub.status,
    billing_interval: interval === 'month' || interval === 'year' ? interval : null,
    extra_sensors: extra,
    current_period_end: periodEnd ? new Date(periodEnd * 1000) : null,
    cancel_at_period_end: sub.cancel_at_period_end,
  }
  await db`insert into subscriptions ${db(row)}
    on conflict (farm_id) do update set stripe_customer_id = excluded.stripe_customer_id, stripe_subscription_id = excluded.stripe_subscription_id,
      status = excluded.status, billing_interval = excluded.billing_interval, extra_sensors = excluded.extra_sensors,
      current_period_end = excluded.current_period_end, cancel_at_period_end = excluded.cancel_at_period_end, updated_at = now()`
}

export async function webhook(ctx: Ctx) {
  const { db } = ctx.deps
  const { stripe, cfg } = stripeFor(ctx)
  const signature = ctx.req.headers.get('stripe-signature')
  if (!signature) throw new HttpError(400, 'missing_signature')
  const payload = await readText(ctx.req)
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(payload, signature, cfg.webhookSecret)
  } catch {
    throw new HttpError(400, 'invalid_signature')
  }

  // Stripe retries: apply each event once. The insert and the update share a transaction, so a failed
  // update rolls back the event id too and Stripe's retry gets another go.
  await db.begin(async (tx) => {
    const fresh = await tx`insert into stripe_events (id, type) values (${event.id}, ${event.type}) on conflict do nothing returning id`
    if (!fresh.length) return
    const txDb = tx as unknown as Db
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object
        if (s.mode === 'subscription' && s.subscription) {
          const sub = await stripe.subscriptions.retrieve(typeof s.subscription === 'string' ? s.subscription : s.subscription.id)
          await saveSubscription(txDb, sub, cfg, s.client_reference_id)
        }
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await saveSubscription(txDb, event.data.object, cfg)
        break
      default:
        // invoice.payment_failed etc.: the matching customer.subscription.updated carries the new status.
        break
    }
  })
  return json(200, { received: true })
}
