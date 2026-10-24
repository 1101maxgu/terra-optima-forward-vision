// Single entry point for every /api/* request (api/router.ts; vercel.json rewrites /api/* here).
import { verifySupabaseToken, type AuthUser } from './auth.js'
import { loadConfig } from './config.js'
import type { Ctx, Deps, Handler } from './context.js'
import { getDb } from './db.js'
import { bearer, HttpError, json, readJson } from './http.js'
import * as assistant from './routes/assistant.js'
import * as esp32 from './routes/esp32.js'
import * as farm from './routes/farm.js'
import * as lorawan from './routes/lorawan.js'

const ROUTES: [string, string, Handler][] = [
  ['GET', '/farms', farm.listFarms],
  ['POST', '/farms', farm.createFarm],
  ['PATCH', '/farms/:farmId', farm.patchFarm],
  ['GET', '/farms/:farmId/data', farm.getFarmData],
  ['POST', '/farms/:farmId/zones', farm.createZone],
  ['PATCH', '/farms/:farmId/zones/:zoneId', farm.patchZone],
  ['DELETE', '/farms/:farmId/zones/:zoneId', farm.deleteZone],
  ['GET', '/farms/:farmId/sensors/status', farm.sensorStatus],
  ['POST', '/farms/:farmId/sensors', farm.createSensor],
  ['PATCH', '/farms/:farmId/sensors/:sensorId', farm.patchSensor],
  ['DELETE', '/farms/:farmId/sensors/:sensorId', farm.deleteSensor],
  ['POST', '/farms/:farmId/sensors/:sensorId/assign', farm.assignSensor],
  ['GET', '/farms/:farmId/sensors/:sensorId/readings', farm.sensorReadings],
  ['POST', '/farms/:farmId/readings/manual', farm.addManualReading],
  ['POST', '/farms/:farmId/irrigation-events', farm.addIrrigationEvent],
  ['POST', '/farms/:farmId/lorawan/ttn/connect', lorawan.connectTtn],
  ['GET', '/farms/:farmId/lorawan/connections', lorawan.listConnections],
  ['PATCH', '/farms/:farmId/lorawan/:connectionId', lorawan.patchConnection],
  ['GET', '/farms/:farmId/lorawan/:connectionId/devices', lorawan.listRemoteDevices],
  ['POST', '/farms/:farmId/lorawan/:connectionId/register', lorawan.registerDevices],
  ['POST', '/ingest/ttn/:connectionId', lorawan.ingestTtn],
  ['POST', '/devices/claim', esp32.claimDevice],
  ['POST', '/ingest/esp32/token', esp32.issueDeviceToken],
  ['POST', '/ingest/esp32', esp32.ingestEsp32],
  ['POST', '/admin/devices', esp32.provisionDevice],
]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Matches a path against the table. Literal segments win over :params when both fit. */
export function match(method: string, path: string): { handler: Handler; params: Record<string, string> } | 'method' | null {
  const segs = path.split('/').filter(Boolean)
  let methodMismatch = false
  let best: { handler: Handler; params: Record<string, string>; literals: number } | null = null
  for (const [m, pattern, handler] of ROUTES) {
    const parts = pattern.split('/').filter(Boolean)
    if (parts.length !== segs.length) continue
    const params: Record<string, string> = {}
    let literals = 0
    const ok = parts.every((p, i) => {
      if (p.startsWith(':')) return UUID.test(segs[i]) && ((params[p.slice(1)] = segs[i].toLowerCase()), true)
      literals++
      return p === segs[i]
    })
    if (!ok) continue
    if (m !== method) {
      methodMismatch = true
      continue
    }
    if (!best || literals > best.literals) best = { handler, params, literals }
  }
  return best ?? (methodMismatch ? 'method' : null)
}

function corsHeaders(req: Request, allowed: string[] | '*'): Record<string, string> {
  const origin = req.headers.get('origin')
  if (!origin || (allowed !== '*' && !allowed.includes(origin))) return {}
  return {
    'access-control-allow-origin': allowed === '*' ? '*' : origin,
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '600',
    vary: 'Origin',
  }
}

const withHeaders = (res: Response, h: Record<string, string>) => {
  for (const [k, v] of Object.entries(h)) res.headers.set(k, v)
  return res
}

/** Production deps from env; null when the backend is not provisioned. */
export function defaultDeps(): Deps | null {
  const config = loadConfig()
  if (!config) return null
  return { config, db: getDb(config.databaseUrl), verifyToken: (t) => verifySupabaseToken(t, config), fetch, now: Date.now }
}

export function createHandler(makeDeps: () => Deps | null) {
  return async function handle(req: Request): Promise<Response> {
    let deps: Deps | null
    try {
      deps = makeDeps()
    } catch (e) {
      console.error('GeoViva backend misconfigured:', e instanceof Error ? e.message : e)
      return json(500, { error: 'backend_misconfigured' })
    }
    const url = new URL(req.url)
    // vercel.json rewrites /api/<path> to /api/router?path=<path>; direct calls use the pathname.
    const path = '/' + (url.searchParams.get('path') ?? url.pathname.replace(/^\/api\/?/, '')).replace(/^\/+|\/+$/g, '')
    // Luke only needs an Anthropic key, so it works before the database/auth backend is provisioned.
    if (path === '/assistant') {
      const cors = corsHeaders(req, deps?.config.allowedOrigins ?? '*')
      if (req.method === 'OPTIONS') return withHeaders(json(204, null), cors)
      if (req.method !== 'POST') return withHeaders(json(405, { error: 'method_not_allowed' }), cors)
      try {
        return withHeaders(await assistant.ask(req), cors)
      } catch (e) {
        return withHeaders(toErrorResponse(e), cors)
      }
    }
    if (!deps) {
      // Not provisioned yet: the static app keeps working; clients treat this as "server not connected".
      const res = req.method === 'OPTIONS' ? json(204, null) : json(503, { error: 'backend_not_configured' })
      return withHeaders(res, corsHeaders(req, '*'))
    }
    const cors = corsHeaders(req, deps.config.allowedOrigins)
    if (req.method === 'OPTIONS') return withHeaders(json(204, null), cors)

    try {
      const m = match(req.method, path)
      if (m === null) throw new HttpError(404, 'not_found')
      if (m === 'method') throw new HttpError(405, 'method_not_allowed')
      let user: Promise<AuthUser> | undefined
      let body: Promise<unknown> | undefined
      const d = deps
      const ctx: Ctx = {
        req, url, params: m.params, deps: d,
        user: () => (user ??= (async () => {
          const t = bearer(req)
          if (!t) throw new HttpError(401, 'unauthorized', 'Sign in required')
          return d.verifyToken(t)
        })()),
        body: () => (body ??= readJson(req)),
        baseUrl: d.config.publicApiUrl ?? url.origin,
      }
      return withHeaders(await m.handler(ctx), cors)
    } catch (e) {
      return withHeaders(toErrorResponse(e), cors)
    }
  }
}

export function toErrorResponse(e: unknown): Response {
  if (e instanceof HttpError) return json(e.status, { error: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) })
  const code = (e as { code?: string } | null)?.code
  // Postgres constraint errors -> client errors without leaking SQL detail.
  if (code === '23505') return json(409, { error: 'conflict', message: 'That record already exists' })
  if (code === '23503') return json(400, { error: 'invalid_reference', message: 'Referenced record does not exist in this farm' })
  if (code === '23514' || code === '22P02' || code === '22007') return json(400, { error: 'invalid_request', message: 'Value rejected by the database' })
  console.error('Unhandled API error', e)
  return json(500, { error: 'internal_error' })
}
