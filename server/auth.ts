// Authentication (Supabase Auth JWTs) and farm-scoped authorization.
// Every farm-scoped handler calls requireMember() before touching data; queries then also
// filter by farm_id, so a guessed zone/sensor id from another farm never matches.
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTVerifyGetKey } from 'jose'
import type { Config } from './config.js'
import type { Db } from './db.js'
import { HttpError } from './http.js'

export interface AuthUser {
  userId: string
  email?: string
}

export type Role = 'viewer' | 'editor' | 'owner'
const RANK: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 }

const jwksCache = new Map<string, JWTVerifyGetKey>()
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Verifies a Supabase access token. HS256 tokens (legacy projects) use SUPABASE_JWT_SECRET;
 * asymmetric tokens (new signing keys) use the project's JWKS at SUPABASE_URL.
 */
export async function verifySupabaseToken(token: string, cfg: Config): Promise<AuthUser> {
  let alg: string | undefined
  try {
    alg = decodeProtectedHeader(token).alg
  } catch {
    throw new HttpError(401, 'invalid_token')
  }
  const opts = {
    audience: 'authenticated',
    ...(cfg.supabaseUrl ? { issuer: `${cfg.supabaseUrl}/auth/v1` } : {}),
  }
  try {
    let payload
    if (alg === 'HS256') {
      if (!cfg.supabaseJwtSecret) throw new Error('HS256 token but no SUPABASE_JWT_SECRET')
      ;({ payload } = await jwtVerify(token, new TextEncoder().encode(cfg.supabaseJwtSecret), { ...opts, algorithms: ['HS256'] }))
    } else {
      if (!cfg.supabaseUrl) throw new Error('Asymmetric token but no SUPABASE_URL')
      const url = `${cfg.supabaseUrl}/auth/v1/.well-known/jwks.json`
      let jwks = jwksCache.get(url)
      if (!jwks) jwksCache.set(url, (jwks = createRemoteJWKSet(new URL(url))))
      ;({ payload } = await jwtVerify(token, jwks, { ...opts, algorithms: ['ES256', 'RS256', 'EdDSA'] }))
    }
    if (typeof payload.sub !== 'string' || !UUID.test(payload.sub)) throw new Error('missing sub')
    return { userId: payload.sub, email: typeof payload.email === 'string' ? payload.email : undefined }
  } catch {
    throw new HttpError(401, 'invalid_token', 'Sign in again')
  }
}

/** Throws 404 when the user is not a member (does not reveal that the farm exists), 403 when the role is too low. */
export async function requireMember(db: Db, user: AuthUser, farmId: string, min: Role): Promise<Role> {
  const rows = await db<{ role: Role }[]>`select role from farm_members where farm_id = ${farmId} and user_id = ${user.userId}`
  const role = rows[0]?.role
  if (!role) throw new HttpError(404, 'farm_not_found')
  if (RANK[role] < RANK[min]) throw new HttpError(403, 'forbidden', `Requires ${min} role`)
  return role
}
