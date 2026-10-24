// Notification hook for sensor-trust flags. Phase 1 has no sender: the default only logs in dev.
// Phase 2 moves this server-side (ingest routes) with per-sensor de-duplication and email/push.
import type { SensorAssessment, TrustVerdict } from '../types'

export type Notifier = (a: SensorAssessment, from: TrustVerdict | null) => void

const ALERTING: TrustVerdict[] = ['likely-faulty', 'uncertain']

export const notifier: Notifier = (a, from) => {
  if (import.meta.env?.DEV) console.info(`[sensor-trust] ${a.sensorId}: ${from ?? 'new'} -> ${a.verdict}. ${a.explanation}`)
}

/** Calls `notify` once per sensor whose verdict moved into an alerting state; acknowledged flags stay quiet. */
export function notifyTransitions(prev: Record<string, SensorAssessment>, next: Record<string, SensorAssessment>, notify: Notifier) {
  for (const a of Object.values(next)) {
    const from = prev[a.sensorId]?.verdict ?? null
    if (from !== a.verdict && ALERTING.includes(a.verdict) && !a.ack) notify(a, from)
  }
}
