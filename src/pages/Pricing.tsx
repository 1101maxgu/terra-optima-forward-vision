// Route: #/pricing. Public. Every number comes from src/pricing/plans.ts.
import { useState, type ReactNode } from 'react'
import { Check, Minus, Plus, X } from 'lucide-react'
import {
  CONTACT_EMAIL, CURRENCY, estimateCost, FREE, money, POLICIES, PRICES_ARE_DRAFT, RENTAL, SEASON, SPONSORED_LINE, WORKED_EXAMPLE,
  type CostEstimate,
} from '../pricing/plans'
import { openLuke } from '../guide/LukeChat'
import Luke from '../guide/Luke'
import { Card, PageHeader } from '../ui/kit'

interface PlanCard {
  name: string
  who: string
  price: ReactNode
  includes: string[]
  excludes: string[]
  cta: ReactNode
  highlight?: boolean
}

export const reserveHref = (what: string) =>
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

const PLANS: PlanCard[] = [
  {
    name: 'Free',
    who: 'Look around and try it on your own farm.',
    price: <Price amount="$0" per="forever" />,
    includes: [
      'As many sections of your field as you like',
      'Type in readings or upload a spreadsheet, as often as you like',
      'Daily watering advice, with the reason why',
      'Weather forecast and the Help guide',
      `Reports for the last ${FREE.reportDays} days`,
      `${FREE.historyDays} days of history`,
    ],
    excludes: ['The AI assistant (Luke)', 'Text alerts'],
    cta: <a href="#/" className="btn-secondary inline-flex min-h-12 w-full items-center justify-center">Start free</a>,
  },
  {
    name: 'Season plan',
    who: 'Everything in Free, plus Luke and text alerts.',
    price: <Price amount={money(SEASON.price)} per="a season" note={`One price for the whole farm. A season is ${SEASON.months} months.`} />,
    includes: [
      'Everything in Free',
      'Luke, the AI assistant, gives detailed watering advice for your crops and soil, using a large crop and soil reference library',
      'Text alerts on your phone when soil is too dry or too wet',
      `${SEASON.reportDays}-day reports for each section`,
      `${SEASON.historyDays / 365} year of history`,
    ],
    excludes: ['Sensors (rent them below)'],
    cta: <a href="#/account?plan=season" className="btn-primary inline-flex min-h-12 w-full items-center justify-center">Choose the Season plan</a>,
    highlight: true,
  },
  {
    name: 'Sensor rental',
    who: 'You never buy the hardware. Works on any plan.',
    price: <Price amount={money(RENTAL.price)} per="per sensor, per season" note="Shipping to your farm is included." />,
    includes: [
      'We ship the sensor to you',
      'No limit on how many you rent',
      'Already own sensors? Use them. You pay nothing extra',
      `Send it back within ${RENTAL.returnDays} days after the season`,
    ],
    excludes: [`If a sensor is not sent back, a ${money(RENTAL.replacementFee)} replacement fee applies`, 'Pilot sensors: reserve now, pay when they ship'],
    cta: <a href={reserveHref('Sensor rental')} className="btn-secondary inline-flex min-h-12 w-full items-center justify-center">Reserve, no charge yet</a>,
  },
]

function Breakdown({ e }: { e: CostEstimate }) {
  return (
    <table className="w-full text-sm">
      <caption className="pb-1 text-left font-bold">Cost for one season</caption>
      <tbody>
        {e.lines.length
          ? e.lines.map((l) => (
              <tr key={l.label} className="border-b border-line">
                <td className="py-2 pr-3">{l.label}</td>
                <td className="py-2 text-right tabular-nums">{money(l.amount)}</td>
              </tr>
            ))
          : <tr><td className="py-2 text-muted">Nothing to pay</td></tr>}
        <tr><td className="py-2 font-bold">Total</td><td className="py-2 text-right text-lg font-bold tabular-nums">{money(e.total)}</td></tr>
      </tbody>
      <tfoot><tr><td colSpan={2} className="pt-2 text-muted">Plus GST/PST.</td></tr></tfoot>
    </table>
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

function Calculator() {
  const [sensors, setSensors] = useState(3)
  const [season, setSeason] = useState(true)
  return (
    <Card className="flex flex-col gap-5">
      <h2 className="text-xl font-bold">Work out your cost</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Stepper label="Sensors to rent" value={sensors} onChange={setSensors} />
        <label className="flex min-h-12 items-center gap-3 font-semibold">
          <input type="checkbox" checked={season} onChange={(e) => setSeason(e.target.checked)} className="size-6" />
          I want Luke and text alerts ({money(SEASON.price)})
        </label>
      </div>
      <Breakdown e={estimateCost({ season, sensors })} />
    </Card>
  )
}

export default function Pricing() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title="Plans and pricing" subtitle={`Simple prices in ${CURRENCY}. Rent your sensors. Never buy them.`} help="pricing" />
      {PRICES_ARE_DRAFT && (
        <p className="rounded-xl border border-sun/40 bg-sun-soft px-4 py-2 text-sm">
          <span className="font-semibold">Draft prices.</span> These may change before launch.
        </p>
      )}

      <ul className="grid gap-4 md:grid-cols-3">
        {PLANS.map((p) => (
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
        <h2 className="text-xl font-bold">Example: a small farm with 3 sensors</h2>
        <p className="text-muted">The Season plan and 3 rented sensors.</p>
        <Breakdown e={estimateCost(WORKED_EXAMPLE)} />
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
