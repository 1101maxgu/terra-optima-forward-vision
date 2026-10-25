// Route: #/help (topic list + search) and #/help/:topic. All text comes from src/guide/content.ts.
import { useState } from 'react'
import { ArrowLeft, ChevronRight, CloudSun, Cpu, Droplets, FlaskConical, Lightbulb, Map as MapIcon, Play, Radio, Rocket, Search, Tag, TriangleAlert, WifiOff } from 'lucide-react'
import { searchTopics, topicById, TOPICS, type Block, type IconKey } from '../guide/content'
import { openLuke } from '../guide/LukeChat'
import { startTour } from '../guide/Tour'
import Luke from '../guide/Luke'
import { Card, PageHeader } from '../ui/kit'

const ICON: Record<Exclude<IconKey, 'luke'>, typeof Rocket> = {
  start: Rocket, zones: MapIcon, sensors: Radio, advice: Droplets, weather: CloudSun, hardware: Cpu, offline: WifiOff, pricing: Tag,
}

function TopicIcon({ icon, className = 'size-6' }: { icon: IconKey; className?: string }) {
  if (icon === 'luke') return <Luke className={className} />
  const I = ICON[icon]
  return <I aria-hidden className={`${className} text-forest`} />
}

const NOTE = {
  pilot: { Icon: FlaskConical, cls: 'border-sun/40 bg-sun-soft', label: 'Pilot' },
  tip: { Icon: Lightbulb, cls: 'border-leaf/30 bg-leaf-soft', label: 'Tip' },
  warn: { Icon: TriangleAlert, cls: 'border-alert/30 bg-alert-soft', label: 'Careful' },
}

function BlockView({ b }: { b: Block }) {
  const note = b.note && NOTE[b.note.kind]
  return (
    <section className="flex flex-col gap-2">
      {b.heading && <h2 className="text-lg font-bold">{b.heading}</h2>}
      {b.body && <p>{b.body}</p>}
      {b.steps && (
        <ol className="flex flex-col gap-2">
          {b.steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-leaf-soft text-sm font-bold text-forest">{i + 1}</span>
              <span className="pt-0.5">{s}</span>
            </li>
          ))}
        </ol>
      )}
      {b.note && note && (
        <p className={`flex gap-2 rounded-xl border p-3 text-sm ${note.cls}`}>
          <note.Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
          <span><span className="font-semibold">{note.label}: </span>{b.note.text}</span>
        </p>
      )}
    </section>
  )
}

function TopicPage({ id }: { id: string }) {
  const t = topicById(id)
  if (!t)
    return (
      <Card>
        <p>That help page doesn’t exist. <a href="#/help" className="font-semibold text-water underline">See all help topics</a></p>
      </Card>
    )
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <a href="#/help" className="inline-flex min-h-11 items-center gap-1 self-start font-semibold text-water">
        <ArrowLeft aria-hidden className="size-5" /> All help topics
      </a>
      <div className="flex items-center gap-3">
        <TopicIcon icon={t.icon} className="size-9" />
        <PageHeader title={t.title} subtitle={t.summary} />
      </div>
      <Card className="flex flex-col gap-6">
        {t.blocks.map((b, i) => <BlockView key={i} b={b} />)}
      </Card>
      <button type="button" onClick={() => openLuke(t.askLuke)} className="btn-secondary inline-flex min-h-12 items-center gap-2 self-start">
        <Luke className="size-7" /> Ask Luke about this
      </button>
    </div>
  )
}

export default function Help({ topic }: { topic?: string }) {
  const [q, setQ] = useState('')
  if (topic) return <TopicPage id={topic} />
  const list = q.trim() ? searchTopics(q) : TOPICS
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader title="Help" subtitle="Short guides to every part of GeoViva. They work without signal too." />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => openLuke()} className="btn-primary inline-flex min-h-12 items-center gap-2">
          <Luke className="size-7" /> Ask Luke
        </button>
        <button type="button" onClick={startTour} className="btn-secondary inline-flex min-h-12 items-center gap-2">
          <Play aria-hidden className="size-5" /> Take the tour again
        </button>
      </div>
      <label className="relative block">
        <span className="sr-only">Search help</span>
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Search help, e.g. “battery” or “draw a field section”"
          className="h-12 w-full rounded-xl border border-line bg-surface pr-3 pl-10" />
      </label>
      {list.length === 0 ? (
        <p className="text-muted">Nothing found. Try other words, or ask Luke.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((t) => (
            <li key={t.id}>
              <a href={`#/help/${t.id}`} className="flex h-full min-h-20 items-center gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-forest">
                <TopicIcon icon={t.icon} className="size-8 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{t.title}</span>
                  <span className="block text-sm text-muted">{t.summary}</span>
                </span>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
