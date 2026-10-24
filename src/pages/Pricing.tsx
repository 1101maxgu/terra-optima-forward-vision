// Route: #/pricing. Public. Every number comes from src/pricing/plans.ts.
import { useState, type ReactNode } from 'react'
import { Check, Minus, Plus, X } from 'lucide-react'
import {
  BUNDLE, bundleListPrice, CURRENCY, estimateCost, EXTRA_SENSOR, FREE, GROWER, money, POLICIES, PRICES_ARE_DRAFT,
  SENSOR, SPONSORED_LINE, CONTACT_EMAIL, WORKED_EXAMPLE, type Billing, type CostEstimate, type Hardware,
} from '../pricing/plans'
import { openLuke } from '../guide/LukeChat'
import Luke from '../guide/Luke'
import { Card, PageHeader } from '../ui/kit'
import ChooseGrower from '../components/billing/ChooseGrower'

interface PlanCard {
  name: string
  who: string
  price: ReactNode
  includes: string[]
  excludes: string[]
  cta: ReactNode
  highlight?: boolean
}

const reserveHref = (what: string) =>
  `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Reserve: ${what}`)}&body=${encodeURIComponent('Farm name:\nLocation:\nHow many sensors:\n')}`

function Price({ amount, per, note }: { amount: string; per?: string; note?: string }) {
  return (
    <div>
      <span className="text-3xl font-bold">{amount}</span>
      {per && <span className="text-muted"> {per}</span>}
      {note && <p className="text-sm text-muted">{note}</p>}
    </div>
  )
}

function plans(billing: Billing): PlanCard[] {
  const grower = billing === 'monthly'
    ? <Price amount={money(GROWER.monthly)} per="/ month" note={`or ${money(GROWER.yearly)} a year (2 months free)`} />
    : <Price amount={money(GROWER.yearly)} per="/ year" note={`2 months free vs ${money(GROWER.monthly)} a month`} />
  const extra = billing === 'monthly' ? `${money(EXTRA_SENSOR.monthly)} a month` : `${money(EXTRA_SENSOR.yearly)} a year`
  return [
    {
      name: 'Free',
      who: 'Try GeoViva on a couple of beds.',
      price: <Price amount="$0" per="forever" />,
      includes: [
        `Up to ${FREE.zones} zones on 1 farm`,
        `Connect ${FREE.sensors} sensor (ours or your own)`,
        'Manual readings and CSV import, unlimited',
        'Daily watering advice with the “why”',
        'Weather forecast, Help guide and Luke',
        'Reports on water used, zone by zone',
        `${FREE.historyDays} days of history`,
      ],
      excludes: [`More than ${FREE.zones} zones or ${FREE.sensors} sensor`],
      cta: <a href="#/" className="btn-secondary inline-flex min-h-12 w-full items-center justify-center">Start free</a>,
    },
    {
      name: 'Grower',
      who: 'Software only, for farms that already have sensors.',
      price: grower,
      includes: [
        'Unlimited zones',
        `${GROWER.sensorsIncluded} connected sensors included`,
        `Extra sensors: ${extra} each`,
        `${GROWER.historyDays / 365} year of history`,
        'Everything in Free',
      ],
      excludes: ['Sensors (bring your own, or add ours)'],
      cta: <ChooseGrower billing={billing} />,
      highlight: true,
    },
    {
      name: 'Starter bundle',
      who: 'Software and sensors, ready to go.',
      price: <Price amount={money(BUNDLE.price)} per="one-time" note={`Saves ${money(bundleListPrice - BUNDLE.price)} vs buying separately`} />,
      includes: [
        `${BUNDLE.sensors} GeoViva Wi-Fi soil sensors`,
        'First year of Grower included',
        `Then ${money(GROWER.yearly)} a year, or ${money(GROWER.monthly)} a month`,
        'Install guide and help from Luke',
      ],
      excludes: [`Shipping (${money(SENSOR.shipping)} flat)`, 'Pilot hardware: reserve now, pay when units ship'],
      cta: <a href={reserveHref('Starter bundle')} className="btn-secondary inline-flex min-h-12 w-full items-center justify-center">Reserve, no charge yet</a>,
    },
    {
      name: 'Sensor only',
      who: 'One sensor, no subscription.',
      price: <Price amount={money(SENSOR.price)} per="per sensor" note={`Parts cost about ${money(SENSOR.partsCost)}. We don’t mark hardware up much.`} />,
      includes: [
        'GeoViva Wi-Fi soil sensor',
        `Works with the Free plan (${FREE.sensors} sensor)`,
        'Upgrade to Grower any time to add more',
        `${SENSOR.returnDays}-day returns if unopened`,
      ],
      excludes: [`Shipping (${money(SENSOR.shipping)} flat)`, 'Pilot hardware: reserve now, pay when units ship'],
      cta: <a href={reserveHref('Sensor')} className="btn-secondary inline-flex min-h-12 w-full items-center justify-center">Reserve, no charge yet</a>,
    },
  ]
}

function Breakdown({ e }: { e: CostEstimate }) {
  const rows = (lines: CostEstimate['firstYear']) =>
    lines.map((l) => (
      <tr key={l.label} className="border-b border-line">
        <td className="py-2 pr-3">{l.label}</td>
        <td className="py-2 text-right tabular-nums">{money(l.amount)}</td>
      </tr>
    ))
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <table className="w-full text-sm">
        <caption className="pb-1 text-left font-bold">First year</caption>
        <tbody>
          {e.firstYear.length ? rows(e.firstYear) : <tr><td className="py-2 text-muted">Nothing to pay</td></tr>}
          <tr><td className="py-2 font-bold">Total</td><td className="py-2 text-right text-lg font-bold tabular-nums">{money(e.firstYearTotal)}</td></tr>
        </tbody>
      </table>
      <table className="w-full text-sm">
        <caption className="pb-1 text-left font-bold">Each year after</caption>
        <tbody>
          {e.laterYears.length ? rows(e.laterYears) : <tr><td className="py-2 text-muted">Nothing to pay</td></tr>}
          <tr><td className="py-2 font-bold">Total</td><td className="py-2 text-right text-lg font-bold tabular-nums">{money(e.laterYearTotal)}</td></tr>
        </tbody>
      </table>
      <p className="text-sm text-muted sm:col-span-2">
        {e.plan === 'free' ? 'This fits the Free plan.' : `That’s about ${money(Math.round(e.laterYearTotal / 12))} a month after year one.`} Plus GST/PST.
      </p>
    </div>
  )
}

function Stepper({ label, value, onChange, min = 0, max = 50 }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <div>
      <span className="mb-1 block font-semibold" id={`${label}-l`}>{label}</span>
      <div className="flex items-center gap-2" role="group" aria-labelledby={`${label}-l`}>
        <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(value - 1)}
          className="grid size-11 place-items-center rounded-full border border-line disabled:opacity-40"><Minus aria-hidden className="size-5" /></button>
        <span className="w-10 text-center text-xl font-bold tabular-nums" aria-live="polite">{value}</span>
        <button type="button" aria-label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(value + 1)}
          className="grid size-11 place-items-center rounded-full border border-line disabled:opacity-40"><Plus aria-hidden className="size-5" /></button>
      </div>
    </div>
  )
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div>
      <span className="mb-1 block font-semibold">{label}</span>
      <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-xl border border-line bg-surface p-1">
        {options.map(([v, text]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
            className={`min-h-10 rounded-lg px-3 font-semibold ${value === v ? 'bg-forest text-white' : 'text-muted'}`}>{text}</button>
        ))}
      </div>
    </div>
  )
}

function Calculator() {
  const [zones, setZones] = useState(3)
  const [sensors, setSensors] = useState(2)
  const [billing, setBilling] = useState<Billing>('yearly')
  const [hardware, setHardware] = useState<Hardware>('own')
  const e = estimateCost({ zones, sensors, billing, hardware })
  return (
    <Card className="flex flex-col gap-5">
      <h2 className="text-xl font-bold">Work out your cost</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Stepper label="Zones" value={zones} onChange={setZones} min={1} />
        <Stepper label="Sensors" value={sensors} onChange={setSensors} />
        <Segmented label="Sensors from" value={hardware} onChange={setHardware}
          options={[['own', 'I have my own'], ['buy', 'Buy GeoViva sensors'], ['bundle', 'Starter bundle']]} />
        <Segmented label="Pay" value={billing} onChange={setBilling} options={[['monthly', 'Monthly'], ['yearly', 'Yearly']]} />
      </div>
      <p className="font-semibold">Plan you need: {e.plan === 'free' ? 'Free' : 'Grower'}</p>
      <Breakdown e={e} />
    </Card>
  )
}

export default function Pricing() {
  const [billing, setBilling] = useState<Billing>('monthly')
  const example = estimateCost(WORKED_EXAMPLE)
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title="Plans and pricing" subtitle={`Simple prices in ${CURRENCY}. No contracts, no hidden fees.`} help="pricing" />
      {PRICES_ARE_DRAFT && (
        <p className="rounded-xl border border-sun/40 bg-sun-soft px-4 py-2 text-sm">
          <span className="font-semibold">Draft prices.</span> These are placeholders while GeoViva is in pilot and may change before launch.
        </p>
      )}

      <Segmented label="Show software prices" value={billing} onChange={setBilling} options={[['monthly', 'Monthly'], ['yearly', 'Yearly (2 months free)']]} />

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {plans(billing).map((p) => (
          <li key={p.name} className={`flex flex-col gap-4 rounded-2xl border bg-surface p-5 ${p.highlight ? 'border-2 border-forest' : 'border-line'}`}>
            <div>
              {p.highlight && <span className="mb-2 inline-block rounded-full bg-leaf-soft px-2 py-0.5 text-xs font-bold text-forest">Most farms</span>}
              <h2 className="text-xl font-bold">{p.name}</h2>
              <p className="text-sm text-muted">{p.who}</p>
            </div>
            {p.price}
            <ul className="flex flex-col gap-2 text-sm">
              {p.includes.map((t) => <li key={t} className="flex gap-2"><Check aria-hidden className="size-5 shrink-0 text-leaf" /><span>{t}</span></li>)}
              {p.excludes.map((t) => <li key={t} className="flex gap-2 text-muted"><X aria-hidden className="size-5 shrink-0" /><span><span className="sr-only">Not included: </span>{t}</span></li>)}
            </ul>
            <div className="mt-auto">{p.cta}</div>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">Prices exclude GST/PST.</p>

      <Card className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Example: a 4-bed market garden</h2>
        <p className="text-muted">4 zones, a sensor in each, Starter bundle, paying yearly.</p>
        <Breakdown e={example} />
      </Card>

      <Calculator />

      <Card className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">The small print, in plain words</h2>
        <ul className="flex list-disc flex-col gap-2 pl-5">{POLICIES.map((p) => <li key={p}>{p}</li>)}</ul>
        <p className="rounded-xl bg-leaf-soft p-3">{SPONSORED_LINE}</p>
      </Card>

      <button type="button" onClick={() => openLuke('Which plan is right for my farm?')} className="btn-secondary inline-flex min-h-12 items-center gap-2 self-start">
        <Luke className="size-7" /> Not sure? Ask Luke
      </button>
    </div>
  )
}
