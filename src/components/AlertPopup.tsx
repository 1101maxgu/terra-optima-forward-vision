// On the demo farm, a text message "arrives" a few seconds after Home opens, once per tab. It is a preview:
// nothing is sent. The wording comes from the same builder as the preview in Settings.
import { useEffect, useState } from 'react'
import { MessageSquareText, X } from 'lucide-react'
import { useFarm } from '../state/farmStore'
import { useUnits } from '../ui/units'
import { buildAlertTexts } from './AlertPreview'

const SEEN_KEY = 'geoviva:alertPopup:v1'
const SHOW_AFTER_MS = 4000
const HIDE_AFTER_MS = 10000

function seen() {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return true // storage blocked: don't risk showing it on every visit
  }
}

export default function AlertPopup() {
  const { zones, zoneStatus } = useFarm()
  const u = useUnits()
  const [open, setOpen] = useState(false)
  const hasDryField = zones.some((z) => zoneStatus(z.id).status === 'water-today')

  useEffect(() => {
    if (!hasDryField || seen()) return
    const show = setTimeout(() => {
      setOpen(true)
      try {
        sessionStorage.setItem(SEEN_KEY, '1')
      } catch {
        /* storage unavailable */
      }
    }, SHOW_AFTER_MS)
    return () => clearTimeout(show)
  }, [hasDryField])

  useEffect(() => {
    if (!open) return
    const hide = setTimeout(() => setOpen(false), HIDE_AFTER_MS)
    return () => clearTimeout(hide)
  }, [open])

  if (!open) return null
  const [first] = buildAlertTexts(zones, zoneStatus, u.text)
  return (
    <div role="status" className="fixed inset-x-3 top-3 z-50 mx-auto max-w-sm animate-[slide-down_300ms_ease-out] motion-reduce:animate-none">
      <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-3 shadow-xl">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-leaf-soft text-forest"><MessageSquareText aria-hidden className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-muted">GeoViva · text message · now</p>
          <p className="mt-0.5">{first}</p>
          <p className="mt-1 text-xs text-muted">Preview. No real texts are sent.</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close message" className="grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-paper">
          <X aria-hidden className="size-5" />
        </button>
      </div>
    </div>
  )
}
