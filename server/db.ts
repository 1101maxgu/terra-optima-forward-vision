// Postgres client (works with Supabase, Neon or any Postgres 15+). One small pool per
// serverless instance; `prepare: false` keeps it compatible with transaction poolers
// (Supabase port 6543, Neon "-pooler" hosts).
import postgres from 'postgres'

export type Db = postgres.Sql

let client: Db | null = null
let clientUrl = ''

export function getDb(url: string): Db {
  if (!client || clientUrl !== url) {
    client = postgres(url, { max: 3, prepare: false, idle_timeout: 20, connect_timeout: 10, ssl: url.includes('sslmode=disable') ? false : 'require' })
    clientUrl = url
  }
  return client
}

/** Records an ingestion failure for operators (never includes secrets). */
export async function logIngest(
  db: Db,
  e: { source: string; reason: string; connectionId?: string | null; deviceId?: string | null; farmId?: string | null; payload?: unknown },
) {
  const payload = e.payload === undefined ? null : JSON.stringify(e.payload).slice(0, 4000)
  try {
    await db`insert into ingestion_log (source, reason, connection_id, device_id, farm_id, payload)
             values (${e.source}, ${e.reason}, ${e.connectionId ?? null}, ${e.deviceId ?? null}, ${e.farmId ?? null}, ${payload})`
  } catch (err) {
    console.error('ingestion_log insert failed', err)
  }
}
