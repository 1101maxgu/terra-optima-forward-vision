// Web-standard Request/Response helpers shared by all routes.
import type { z } from 'zod'

export class HttpError extends Error {
  status: number
  code: string
  details?: unknown
  constructor(status: number, code: string, message?: string, details?: unknown) {
    super(message ?? code)
    this.status = status
    this.code = code
    this.details = details
  }
}

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  })
}

const MAX_BODY = 512 * 1024

/** Raw body, size-limited. Webhook signatures must be checked against these exact bytes. */
export async function readText(req: Request): Promise<string> {
  const len = Number(req.headers.get('content-length') ?? 0)
  if (len > MAX_BODY) throw new HttpError(413, 'payload_too_large')
  const text = await req.text()
  if (text.length > MAX_BODY) throw new HttpError(413, 'payload_too_large')
  return text
}

export async function readJson(req: Request): Promise<unknown> {
  const text = await readText(req)
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body is not valid JSON')
  }
}

export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data)
  if (!r.success)
    throw new HttpError(400, 'invalid_request', 'Request failed validation', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })))
  return r.data
}

export function bearer(req: Request): string | null {
  const h = req.headers.get('authorization') ?? ''
  const m = /^Bearer\s+(\S+)$/i.exec(h)
  return m ? m[1] : null
}
