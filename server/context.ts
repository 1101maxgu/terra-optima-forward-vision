import type { AuthUser } from './auth.js'
import type { Config } from './config.js'
import type { Db } from './db.js'

/** Everything a handler needs; injected so tests can swap the DB, auth and outbound fetch. */
export interface Deps {
  config: Config
  db: Db
  verifyToken(token: string): Promise<AuthUser>
  fetch: typeof fetch
  now(): number
}

export interface Ctx {
  req: Request
  url: URL
  params: Record<string, string>
  deps: Deps
  /** Verified caller (throws 401). */
  user(): Promise<AuthUser>
  body(): Promise<unknown>
  /** Public origin used to build webhook / ingest URLs. */
  baseUrl: string
}

export type Handler = (ctx: Ctx) => Promise<Response>
