// Luke's corner button and chat. Online: asks the assistant API. Offline or unavailable: searches the
// bundled guide instead, so the farmer always gets something useful.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Send, WifiOff } from 'lucide-react'
import { useFarm } from '../state/farmStore'
import { AssistantUnavailableError, askLuke, buildContext, type ChatTurn } from '../services/assistantApi'
import { Dialog } from '../ui/controls'
import { searchTopics, type Topic } from './content'
import Luke from './Luke'
import PlanNudge from '../components/billing/PlanNudge'

const OPEN_EVENT = 'geoviva:luke'

/** Opens Luke from anywhere (Help pages, empty states), optionally with a question ready to send. */
export function openLuke(question?: string) {
  window.dispatchEvent(new CustomEvent<string | undefined>(OPEN_EVENT, { detail: question }))
}

type Msg = ChatTurn | { role: 'fallback'; text: string; topics: Topic[] }

const GREETING = 'Hi, I’m Luke! Ask me anything about using GeoViva, your watering advice, or setting up a sensor.'

export default function LukeLauncher({ path, hidden }: { path: string; hidden?: boolean }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    const on = (e: Event) => {
      setDraft((e as CustomEvent<string | undefined>).detail ?? '')
      setOpen(true)
    }
    window.addEventListener(OPEN_EVENT, on)
    return () => window.removeEventListener(OPEN_EVENT, on)
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask Luke, the help assistant"
        data-tour="luke"
        className={`fixed right-4 bottom-20 z-30 size-14 place-items-center rounded-full border border-line bg-surface shadow-lg transition hover:scale-105 md:right-6 md:bottom-6 ${hidden ? 'hidden md:grid' : 'grid'}`}
      >
        <Luke className="size-11" />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Ask Luke">
        {open && <Chat path={path} draft={draft} onNavigate={() => setOpen(false)} />}
      </Dialog>
    </>
  )
}

function Chat({ path, draft, onNavigate }: { path: string; draft: string; onNavigate: () => void }) {
  const farm = useFarm()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState(draft)
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs, busy])

  const send = async (e?: FormEvent) => {
    e?.preventDefault()
    const q = text.trim()
    if (!q || busy) return
    const history = msgs.filter((m): m is ChatTurn => m.role !== 'fallback')
    setMsgs((m) => [...m, { role: 'user', text: q }])
    setText('')
    setBusy(true)
    try {
      const context = buildContext({ ...farm, route: path })
      const answer = await askLuke(q, history, context)
      setMsgs((m) => [...m, { role: 'assistant', text: answer }])
    } catch (err) {
      const topics = searchTopics(q).slice(0, 3)
      const why = !(err instanceof AssistantUnavailableError)
        ? err instanceof Error ? err.message : 'I can’t answer right now.'
        : err.message === 'offline' ? 'I need an internet connection to chat.' : 'I can’t chat right now.'
      setMsgs((m) => [...m, {
        role: 'fallback',
        text: topics.length ? `${why} These guide pages might help:` : `${why} Try the Help pages in the meantime.`,
        topics,
      }])
    } finally {
      setBusy(false)
    }
  }

  if (farm.limits && !farm.limits.assistant)
    return (
      <div className="flex flex-col gap-3">
        <PlanNudge>Luke, the AI assistant, comes with the Season plan. The Help pages are free and answer most questions.</PlanNudge>
        <a href="#/help" onClick={onNavigate} className="btn-secondary inline-flex min-h-11 w-fit items-center">Open the Help pages</a>
      </div>
    )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex max-h-[55vh] min-h-48 flex-col gap-3 overflow-y-auto" aria-live="polite">
        <Bubble from="luke">{GREETING}</Bubble>
        {farm.dataset === 'sample' && (
          <p className="text-center text-xs text-muted">You’re on the Sample farm, so Luke answers from the guide only.</p>
        )}
        {msgs.map((m, i) =>
          m.role !== 'fallback' ? (
            <Bubble key={i} from={m.role === 'user' ? 'you' : 'luke'}>{m.text}</Bubble>
          ) : (
            <Bubble key={i} from="luke">
              <span className="flex items-start gap-2"><WifiOff aria-hidden className="mt-0.5 size-4 shrink-0" />{m.text}</span>
              {m.topics.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1">
                  {m.topics.map((t) => (
                    <li key={t.id}>
                      <a href={`#/help/${t.id}`} onClick={onNavigate} className="font-semibold text-water underline">{t.title}</a>
                    </li>
                  ))}
                </ul>
              )}
            </Bubble>
          ),
        )}
        {busy && <Bubble from="luke" thinking>Thinking…</Bubble>}
        <div ref={end} />
      </div>
      <form onSubmit={send} className="flex gap-2">
        <label htmlFor="luke-q" className="sr-only">Your question</label>
        <input
          id="luke-q"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask a question…"
          autoComplete="off"
          className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3"
        />
        <button type="submit" disabled={busy || !text.trim()} aria-label="Send" className="btn-primary grid size-12 shrink-0 place-items-center p-0 disabled:opacity-50">
          <Send aria-hidden className="size-5" />
        </button>
      </form>
      <p className="text-xs text-muted">Luke explains the app and your advice. He can’t change anything, and he isn’t an agronomist.</p>
    </div>
  )
}

function Bubble({ from, thinking, children }: { from: 'luke' | 'you'; thinking?: boolean; children: ReactNode }) {
  if (from === 'you')
    return <p className="ml-10 self-end rounded-2xl rounded-br-sm bg-forest px-3 py-2 whitespace-pre-line text-white">{children}</p>
  return (
    <div className="mr-6 flex items-end gap-2">
      <Luke className="size-8 shrink-0" mood={thinking ? 'thinking' : 'happy'} />
      <div className={`rounded-2xl rounded-bl-sm bg-leaf-soft px-3 py-2 whitespace-pre-line ${thinking ? 'text-muted' : ''}`}>{children}</div>
    </div>
  )
}
