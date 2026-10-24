// Luke, the in-app help assistant. Needs only ANTHROPIC_API_KEY (no database), so the router serves it
// even before the rest of the backend is provisioned. Read-only: it answers, it never changes farm data.
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { TOPICS } from '../../src/guide/content.js'
import { HttpError, json, parse, readJson } from '../http.js'

const MODEL = 'claude-opus-5-5'

const request = z.object({
  question: z.string().trim().min(1).max(1000),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(4000) })).max(12).default([]),
  // Plain-text snapshot of what the farmer is looking at, built by the browser. Absent for the Sample farm.
  context: z.string().max(6000).optional(),
})

const guideText = TOPICS.map((t) =>
  [`## ${t.title}`, t.summary, ...t.blocks.flatMap((b) => [b.heading ? `### ${b.heading}` : '', b.body ?? '', ...(b.steps ?? []).map((s, i) => `${i + 1}. ${s}`), b.note ? `(${b.note.kind}) ${b.note.text}` : ''])]
    .filter(Boolean)
    .join('\n'),
).join('\n\n')

// Frozen so the prompt cache hits on every request; per-request data goes in the messages.
const SYSTEM = `You are Luke, the friendly leaf who helps farmers use GeoViva, an irrigation app for small vegetable and berry farms in British Columbia.

Personality: warm, positive and encouraging, like a helpful neighbour. Plain words, short sentences, no jargon (explain any term you must use). Most answers are 2 to 5 short sentences or a few numbered steps. Farmers are often on a phone in the field.

What you do:
- Explain how to use the app, using the guide below as the source of truth. Name the exact screen and button.
- When the farmer's current farm data is included, explain why a zone has its status, using those numbers and the "why" factors. Never invent readings, zones or sensors that are not in the data.
- Help install and troubleshoot soil sensors as the guide describes. The GeoViva Wi-Fi sensor is a pilot that has not been built or field-tested: say so when it comes up.

What you don't do:
- You cannot change anything in the app. Tell the farmer where to tap instead.
- You are not an agronomist. For crop choice, pests, disease, fertiliser or anything beyond watering advice shown in the app, say kindly that this is outside what you can help with and suggest their local extension office or advisor.
- If the guide doesn't cover something, say you're not sure rather than guessing.

<guide>
${guideText}
</guide>`

// Best-effort per-client limit. Serverless instances don't share memory, so this caps bursts, not totals.
const WINDOW_MS = 10 * 60_000
const MAX_PER_WINDOW = 20
const hits = new Map<string, number[]>()
function rateLimit(key: string, now: number) {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
  if (recent.length >= MAX_PER_WINDOW) throw new HttpError(429, 'rate_limited', 'Luke needs a short rest. Try again in a few minutes.')
  recent.push(now)
  hits.set(key, recent)
}

let client: Anthropic | undefined

export async function ask(req: Request, env: NodeJS.ProcessEnv = process.env): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) return json(503, { error: 'backend_not_configured' })
  const clientKey = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  rateLimit(clientKey, Date.now())
  const input = parse(request, await readJson(req))

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...input.history.map((m) => ({ role: m.role, content: m.text })),
    {
      role: 'user',
      content: input.context ? `<farm_data>\n${input.context}\n</farm_data>\n\n${input.question}` : input.question,
    },
  ]
  // The API wants the first turn from the user; drop a leading assistant greeting if the client sent one.
  while (messages[0]?.role === 'assistant') messages.shift()

  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  const params = {
    model: MODEL,
    max_tokens: 2000,
    output_config: { effort: 'low' as const },
    system: [{ type: 'text' as const, text: SYSTEM, cache_control: { type: 'ephemeral' as const } }],
    messages,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default' as const, // re-runs on a fallback model if a safety classifier declines
  }
  let res: Anthropic.Beta.BetaMessage
  try {
    res = await client.beta.messages.create(params as Anthropic.Beta.MessageCreateParamsNonStreaming)
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, 'rate_limited', 'Luke is busy right now. Try again in a minute.')
    if (e instanceof Anthropic.APIError) {
      console.error('Assistant API error', e.status, e.message)
      throw new HttpError(502, 'assistant_unavailable', 'Luke can’t answer right now. Try again later.')
    }
    throw e
  }
  if (res.stop_reason === 'refusal') return json(200, { answer: 'Sorry, I can’t help with that one. Try asking about how to use GeoViva or your watering advice.' })
  const answer = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim()
  return json(200, { answer: answer || 'Sorry, I didn’t catch that. Could you ask again?' })
}
