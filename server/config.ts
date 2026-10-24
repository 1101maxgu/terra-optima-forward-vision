// Server configuration from environment variables (see .env.example and docs/backend.md).
// Read lazily so tests can set process.env before the first request.

export interface Config {
  databaseUrl: string
  encryptionKey: Buffer // 32 bytes, AES-256-GCM + HMAC key derivation
  supabaseUrl?: string // enables JWKS (asymmetric) verification + issuer check
  supabaseJwtSecret?: string // legacy HS256 shared secret
  allowedOrigins: string[]
  publicApiUrl?: string // e.g. https://geoviva-tau.vercel.app (used to build webhook/ingest URLs)
  adminToken?: string // enables POST /api/admin/devices (factory provisioning)
  billing?: BillingConfig // Stripe; billing routes answer 503 until every value is set
}

export interface BillingConfig {
  stripeSecretKey: string
  webhookSecret: string
  appUrl: string // where Checkout and the Customer Portal send the farmer back, e.g. https://geoviva-tau.vercel.app
  prices: { growerMonthly: string; growerYearly: string; sensorMonthly: string; sensorYearly: string } // Stripe price ids
}

function loadBilling(env: NodeJS.ProcessEnv): BillingConfig | undefined {
  const b = {
    stripeSecretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    appUrl: env.GEOVIVA_APP_URL?.replace(/\/$/, ''),
    prices: {
      growerMonthly: env.STRIPE_PRICE_GROWER_MONTHLY,
      growerYearly: env.STRIPE_PRICE_GROWER_YEARLY,
      sensorMonthly: env.STRIPE_PRICE_SENSOR_MONTHLY,
      sensorYearly: env.STRIPE_PRICE_SENSOR_YEARLY,
    },
  }
  const all = [b.stripeSecretKey, b.webhookSecret, b.appUrl, ...Object.values(b.prices)]
  return all.every(Boolean) ? (b as BillingConfig) : undefined
}

/** Returns the config, or null when the backend is not provisioned (every endpoint then answers 503). */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config | null {
  const databaseUrl = env.DATABASE_URL
  const keyRaw = env.GEOVIVA_ENCRYPTION_KEY
  const supabaseUrl = env.SUPABASE_URL?.replace(/\/$/, '') || undefined
  const supabaseJwtSecret = env.SUPABASE_JWT_SECRET || undefined
  if (!databaseUrl || !keyRaw || (!supabaseUrl && !supabaseJwtSecret)) return null
  const encryptionKey = Buffer.from(keyRaw, 'base64')
  if (encryptionKey.length !== 32) throw new Error('GEOVIVA_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)')
  return {
    databaseUrl,
    encryptionKey,
    supabaseUrl,
    supabaseJwtSecret,
    allowedOrigins: (env.GEOVIVA_ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    publicApiUrl: env.GEOVIVA_PUBLIC_API_URL?.replace(/\/$/, '') || undefined,
    adminToken: env.GEOVIVA_ADMIN_TOKEN || undefined,
    billing: loadBilling(env),
  }
}
