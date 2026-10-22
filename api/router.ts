// Vercel Node.js function. vercel.json rewrites every /api/* request here; routing lives in server/router.ts.
// With no DATABASE_URL etc. configured every endpoint answers 503 { error: 'backend_not_configured' }.
import { createHandler, defaultDeps } from '../server/router.js'

const handle = createHandler(defaultDeps)

export const GET = handle
export const POST = handle
export const PATCH = handle
export const DELETE = handle
export const OPTIONS = handle
