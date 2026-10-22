// Secrets at rest: LoRaWAN API keys are encrypted (AES-256-GCM, they must be usable later);
// webhook secrets, device tokens, factory secrets and claim codes are only ever compared, so
// they are stored as HMAC-SHA256 with a server key (deterministic -> indexable lookups).
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto'

const b64u = (b: Buffer) => b.toString('base64url')

export function encrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return ['v1', b64u(iv), b64u(c.getAuthTag()), b64u(ct)].join('.')
}

export function decrypt(box: string, key: Buffer): string {
  const [v, iv, tag, ct] = box.split('.')
  if (v !== 'v1' || !iv || !tag || ct === undefined) throw new Error('Unsupported ciphertext format')
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
  d.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8')
}

const hmacKeys = new WeakMap<Buffer, Buffer>()
function hmacKey(master: Buffer): Buffer {
  let k = hmacKeys.get(master)
  if (!k) hmacKeys.set(master, (k = Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), 'geoviva-secret-hmac-v1', 32))))
  return k
}

/** Keyed hash for secrets we only compare (hex). Same input + key -> same output. */
export function hashSecret(secret: string, master: Buffer): string {
  return createHmac('sha256', hmacKey(master)).update(secret, 'utf8').digest('hex')
}

/** Constant-time string compare (length mismatch still does a full compare). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) {
    timingSafeEqual(ab, ab)
    return false
  }
  return timingSafeEqual(ab, bb)
}

export function verifySecret(secret: string, storedHash: string, master: Buffer): boolean {
  return safeEqual(hashSecret(secret, master), storedHash)
}

export const randomToken = (bytes = 32) => b64u(randomBytes(bytes))

// Crockford base32 (no I, L, O, U) so printed claim codes survive being read aloud / retyped.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** 12 random symbols (60 bits) printed on the device label as XXXX-XXXX-XXXX. */
export function newClaimCode(): string {
  const bytes = randomBytes(12)
  const s = Array.from(bytes, (b) => CROCKFORD[b & 31]).join('')
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`
}

/** Canonical form for hashing: case-insensitive, separators ignored, O->0 and I/L->1. */
export function normalizeClaimCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')
}
