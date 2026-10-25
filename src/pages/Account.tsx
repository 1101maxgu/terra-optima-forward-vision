// Route: #/account. Sign in with an emailed link, see the farm's plan, upgrade (Stripe Checkout) or manage it
// (Stripe Customer Portal). `?plan=grower&billing=yearly` arrives from the Pricing page; `?checkout=done` from Stripe.
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { CheckCircle2, Loader2, LogOut, Mail, Minus, Plus } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useFarm } from '../state/farmStore'
import { billingAvailable, getFarmPlan, openBillingPortal, type FarmPlan } from '../services/billingApi'
import { money, PLAN_NAME, RENTAL, SEASON } from '../pricing/plans'
import { reserveHref } from './Pricing'
import { Card, PageHeader } from '../ui/kit'
import { ErrorNote } from '../ui/controls'

const query = () => new URLSearchParams(window.location.hash.split('?')[1] ?? '')
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.')

function SignIn() {
  const { sendLink } = useAuth()
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setState('sending')
    setError(null)
    try {
      await sendLink(email.trim())
      setState('sent')
    } catch (err) {
      setError(errText(err))
      setState('idle')
    }
  }
  if (state === 'sent')
    return (
      <Card className="flex items-start gap-3">
        <Mail aria-hidden className="mt-1 size-6 shrink-0 text-forest" />
        <div>
          <h2 className="text-xl font-bold">Check your email</h2>
          <p className="mt-1">We sent a sign-in link to <strong>{email}</strong>. Open it on this phone or computer. No password needed.</p>
        </div>
      </Card>
    )
  return (
    <Card>
      <h2 className="text-xl font-bold">Sign in</h2>
      <p className="mt-1 mb-4 text-muted">Enter your email and we’ll send you a link. New here? The same link creates your account.</p>
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <label htmlFor="acct-email" className="sr-only">Email</label>
        <input id="acct-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="you@yourfarm.ca" className="h-12 min-w-0 flex-1 basis-60 rounded-xl border border-line bg-surface px-3" />
        <button type="submit" disabled={state === 'sending'} className="btn-primary min-h-12">{state === 'sending' ? 'Sending…' : 'Email me a link'}</button>
      </form>
      {error && <ErrorNote className="mt-3">{error}</ErrorNote>}
    </Card>
  )
}

function Upgrade() {
  const [sensors, setSensors] = useState(0)
  const total = SEASON.price + sensors * RENTAL.price
  return (
    <div className="mt-4 flex flex-col gap-4 rounded-xl border border-line p-4">
      <h3 className="text-lg font-bold">Get the Season plan</h3>
      <p>{money(SEASON.price)} for the whole farm for {SEASON.months} months. It adds Luke, the AI assistant, and text alerts.</p>
      <div>
        <p className="font-semibold">Sensors to rent</p>
        <div className="mt-1 flex items-center gap-2">
          <button type="button" aria-label="Fewer sensors" disabled={sensors === 0} onClick={() => setSensors(sensors - 1)}
            className="grid size-11 place-items-center rounded-full border border-line disabled:opacity-40"><Minus aria-hidden className="size-5" /></button>
          <span className="w-8 text-center text-xl font-bold tabular-nums" aria-live="polite">{sensors}</span>
          <button type="button" aria-label="More sensors" disabled={sensors >= 50} onClick={() => setSensors(sensors + 1)}
            className="grid size-11 place-items-center rounded-full border border-line disabled:opacity-40"><Plus aria-hidden className="size-5" /></button>
          <span className="text-sm text-muted">{money(RENTAL.price)} each, shipping included</span>
        </div>
      </div>
      <p><span className="text-2xl font-bold">{money(total)}</span> for the season, plus GST/PST.</p>
      <a href={reserveHref(`Season plan with ${sensors} sensors`)} className="btn-primary inline-flex min-h-12 items-center justify-center self-start">Reserve my season, no charge yet</a>
      <p className="text-sm text-muted">Online payment is coming soon. Reserving holds your place. You pay one time for the season, and it never renews by itself.</p>
    </div>
  )
}

function PlanCard() {
  const q = query()
  const { reload } = useFarm()
  const [plan, setPlan] = useState<FarmPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const justPaid = q.get('checkout') === 'done'

  const load = useCallback(() => getFarmPlan().then(setPlan, (e) => setError(errText(e))), [])
  useEffect(() => {
    load()
    // Stripe's webhook can land a few seconds after the redirect: look again shortly.
    if (justPaid) {
      const t = setTimeout(() => { load(); reload() }, 4000)
      return () => clearTimeout(t)
    }
  }, [load, justPaid, reload])

  if (error) return <ErrorNote>{error}</ErrorNote>
  if (!plan) return <p className="flex items-center gap-2 text-muted"><Loader2 aria-hidden className="size-5 animate-spin" /> Loading your plan…</p>

  const renews = plan.currentPeriodEnd && new Date(plan.currentPeriodEnd).toLocaleDateString('en-CA', { dateStyle: 'long' })
  return (
    <Card>
      {justPaid && (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-leaf-soft p-3 font-medium">
          <CheckCircle2 aria-hidden className="size-5 text-leaf" /> Thanks! {plan.plan === 'grower' ? 'Your Season plan is on.' : 'Your plan will update in a moment.'}
        </p>
      )}
      <h2 className="text-xl font-bold">Your plan: {PLAN_NAME[plan.plan]}</h2>
      <ul className="mt-2 flex flex-col gap-1 text-muted">
        <li>Sections of your field: {plan.usage.zones}</li>
        <li>Connected sensors: {plan.usage.sensors}</li>
        {plan.plan === 'grower' && renews && (
          <li>{plan.cancelAtPeriodEnd ? `Your Season plan runs until ${renews}, then your farm moves to Free. Nothing is deleted.` : `Your Season plan runs until ${renews}.`}</li>
        )}
        {plan.status === 'past_due' && <li className="font-semibold text-alert">Your last payment didn’t go through. Update your card under “Manage plan”.</li>}
      </ul>
      {!plan.billingEnabled ? (
        <p className="mt-4 rounded-xl bg-sun-soft p-3 text-sm">Payments aren’t switched on yet. Your farm stays on the Free plan for now.</p>
      ) : plan.plan === 'grower' || plan.status ? (
        <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await openBillingPortal() } catch (e) { setError(errText(e)); setBusy(false) } }}
          className="btn-secondary mt-4 min-h-12">Manage plan, sensors or card</button>
      ) : null}
      {plan.billingEnabled && plan.plan === 'free' && <Upgrade />}
    </Card>
  )
}

export default function Account() {
  const auth = useAuth()
  const { dataset, setDataset } = useFarm()
  const wantsGrower = query().get('plan') === 'season'

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <PageHeader title="Account and plan" />
      {!auth.configured ? (
        <Card>
          <h2 className="text-xl font-bold">Accounts are coming soon</h2>
          <p className="mt-1 text-muted">For now your farm is kept only in this browser tab, until you close it, and uses the Free plan. Sign-in and paid plans switch on once GeoViva’s server is set up.</p>
          <a href="#/pricing" className="btn-secondary mt-4 inline-flex min-h-11 items-center">See plans and pricing</a>
        </Card>
      ) : !auth.ready ? (
        <p className="flex items-center gap-2 text-muted"><Loader2 aria-hidden className="size-5 animate-spin" /> Checking sign-in…</p>
      ) : !auth.userId ? (
        <>
          {wantsGrower && <p className="rounded-xl bg-leaf-soft p-3">Sign in first, then you can choose the Season plan. It takes a minute.</p>}
          <SignIn />
        </>
      ) : (
        <>
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-muted">Signed in as</p>
              <p className="truncate font-semibold">{auth.email}</p>
            </div>
            <button type="button" onClick={auth.signOut} className="btn-secondary inline-flex min-h-11 items-center gap-2">
              <LogOut aria-hidden className="size-5" /> Sign out
            </button>
          </Card>
          {dataset === 'sample' ? (
            <Card>
              <p>You’re looking at the Sample farm. Plans apply to your own farm.</p>
              <button type="button" onClick={() => setDataset('mine')} className="btn-primary mt-3 min-h-11">Open my farm</button>
            </Card>
          ) : billingAvailable() ? (
            <PlanCard />
          ) : (
            <Card><p className="text-muted">Your farm is kept only in this browser tab, until you close it, and uses the Free plan. Paid plans need GeoViva’s server, which isn’t set up yet.</p></Card>
          )}
        </>
      )}
    </div>
  )
}
