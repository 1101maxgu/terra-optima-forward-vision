// Route: #/more. The phone's "More" tab: every page that has no room in the bottom bar.
import { CircleHelp, CloudSun, Play, Settings, Tag, UserRound } from 'lucide-react'
import { useFarm } from '../state/farmStore'
import { PageHeader } from '../ui/kit'

const LINKS = [
  { href: '#/help', label: 'Help and guides', note: 'How-tos, sensor setup and troubleshooting', Icon: CircleHelp },
  { href: '#/pricing', label: 'Plans and pricing', note: 'Free, the Season plan and sensor rental', Icon: Tag },
  { href: '#/weather', label: 'Weather', note: 'Forecast, rain and how fast the soil dries', Icon: CloudSun },
  { href: '#/settings', label: 'Settings', note: 'Farm details, text alerts and data', Icon: Settings },
  { href: '#/account', label: 'Account', note: 'Sign in and manage your plan', Icon: UserRound },
]

export default function More() {
  const { dataset, setDataset } = useFarm()
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <PageHeader title="More" />
      <button
        type="button"
        onClick={() => { setDataset(dataset === 'sample' ? 'mine' : 'sample'); window.location.hash = '#/' }}
        className="btn-primary inline-flex min-h-14 items-center justify-center gap-2"
      >
        <Play aria-hidden className="size-5" /> {dataset === 'sample' ? 'Back to my farm' : 'View the demo farm'}
      </button>
      <ul className="flex flex-col gap-2">
        {LINKS.map(({ href, label, note, Icon }) => (
          <li key={href}>
            <a href={href} className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-leaf-soft text-forest"><Icon aria-hidden className="size-5" /></span>
              <span className="min-w-0">
                <span className="block font-semibold">{label}</span>
                <span className="block text-sm text-muted">{note}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
