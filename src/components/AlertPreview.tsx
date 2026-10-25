// A phone-style preview of the text alerts that come with the Season plan. Nothing is sent: the messages are
// written from the farm's own watering advice and clearly labelled "Preview".
import { MessageSquareText } from 'lucide-react'
import { useFarm } from '../state/farmStore'
import { fmtPct } from '../ui/kit'
import { money, SEASON } from '../pricing/plans'

export default function AlertPreview() {
  const { farm, zones, zoneStatus, limits } = useFarm()
  const texts = zones.flatMap((z) => {
    const st = zoneStatus(z.id)
    const m = fmtPct(st.moisturePct)
    if (st.status === 'water-today') return [`${z.name} is too dry (${m}). Water today.`]
    if (st.status === 'water-soon') return [`${z.name} is getting dry (${m}). Plan to water in the next 2 days.`]
    if (st.status === 'check-sensor') return [`The sensor in ${z.name} may be off. Please take a look.`]
    return []
  }).slice(0, 3)
  if (!texts.length) texts.push('Good news: nothing needs water today.')
  const locked = limits !== null && !limits.textAlerts

  return (
    <div className="grid items-center gap-6 sm:grid-cols-[auto_1fr]">
      <div role="img" aria-label="Preview of text messages on a phone" className="mx-auto w-64 rounded-[2rem] border-4 border-ink bg-surface p-3 shadow-lg">
        <p className="mb-2 text-center text-xs font-semibold text-muted">GeoViva · now</p>
        <ul className="flex flex-col gap-2">
          {texts.map((t) => (
            <li key={t} className="rounded-2xl rounded-bl-sm bg-leaf-soft px-3 py-2 text-sm">{t}</li>
          ))}
        </ul>
        <p className="mt-3 text-center text-xs text-muted">{farm.name || 'Your farm'}</p>
      </div>
      <div className="flex flex-col gap-2">
        <p className="inline-flex w-fit items-center gap-2 rounded-full bg-sun-soft px-3 py-1 text-sm font-bold"><MessageSquareText aria-hidden className="size-4" /> Preview. No real texts are sent yet.</p>
        <p>With the Season plan, GeoViva texts you when a section of your field is too dry or too wet. No need to open the app.</p>
        <p className="text-muted">Normal farms get a few texts a week, and about {SEASON.textsPerMonth} a month is the most we send.</p>
        {locked && <a href="#/pricing" className="btn-primary inline-flex min-h-12 w-fit items-center">Get the Season plan, {money(SEASON.price)}</a>}
      </div>
    </div>
  )
}
