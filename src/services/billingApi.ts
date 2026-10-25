// Client for the farm's plan and Stripe billing (server/routes/billing.ts). Payment pages are Stripe's:
// we only ask the server for a Checkout or Customer Portal link and send the browser there.
import type { Limits, PlanId } from '../pricing/plans'

type Billing = 'monthly' | 'yearly'
import { apiFetch, currentFarmId } from '../data/apiRepo'
import { isBackendConfigured } from './deviceApi'

export interface FarmPlan extends Limits {
  plan: PlanId
  status: string | null
  interval: 'month' | 'year' | null
  extraSensors: number
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  usage: { zones: number; sensors: number }
  billingEnabled: boolean
}

export const billingAvailable = isBackendConfigured

export async function getFarmPlan(): Promise<FarmPlan> {
  return apiFetch<FarmPlan>(`/farms/${await currentFarmId()}/billing`)
}

export async function startCheckout(billing: Billing, extraSensors = 0): Promise<void> {
  const { url } = await apiFetch<{ url: string }>(`/farms/${await currentFarmId()}/billing/checkout`, { method: 'POST', body: { billing, extraSensors } })
  window.location.assign(url)
}

export async function openBillingPortal(): Promise<void> {
  const { url } = await apiFetch<{ url: string }>(`/farms/${await currentFarmId()}/billing/portal`, { method: 'POST' })
  window.location.assign(url)
}
