// Sensor trust: rules-based checks on each probe's recent readings. Pure; no React, no network.
// Output is a verdict + confidence + the signals behind it, so every flag can be explained.
// Thresholds are illustrative, to be tuned against real probe data (see docs/sensor-trust.md).
import type { IrrigationEvent, Sensor, SensorAssessment, SensorReading, Signal, TrustVerdict, WeatherDay } from '../types'

const H = 3600_000
export const LIMITS = {
  staleH: 24, // newest reading older than this: not assessed (the offline alert covers it)
  flatMinReadings: 3, flatMinSpanH: 6, flatEps: 0.05, // flatline: identical (±0.05 pp) for 3+ readings over 6+ h
  spikePp: 15, spikeWindowH: 48, // jump between consecutive readings, percentage points
  peerPp: 10, // allowed gap to same-zone probes (covers depth differences)
  moisture: [1, 60], soilTempC: [-10, 50], // physical limits
  lowBattery: 20,
  riseH: 24, risePp: 3, // moisture rising this much in 24 h needs rain or irrigation
  explainRainMm: 5, explainIrrigationH: 12,
  trustedAt: 0.75, faultyBelow: 0.4,
} as const

const round1 = (n: number) => Math.round(n * 10) / 10
const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b), m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function ownSignals(s: Sensor, rs: SensorReading[], days: WeatherDay[], events: IrrigationEvent[]) {
  const out: Signal[] = []
  let since: string | undefined
  const note = (t: string) => { if (!since || t < since) since = t }
  const last = rs[rs.length - 1]
  const lastT = Date.parse(last.timestamp)

  const [lo, hi] = LIMITS.moisture
  if (last.soilMoisturePercent < lo || last.soilMoisturePercent > hi) {
    out.push({ kind: 'out-of-range', weight: 0.7, detail: `reads ${round1(last.soilMoisturePercent)}%, outside what soil can physically hold` })
    note(last.timestamp)
  }
  const t = last.soilTemperatureC
  if (typeof t === 'number' && (t < LIMITS.soilTempC[0] || t > LIMITS.soilTempC[1])) {
    out.push({ kind: 'out-of-range', weight: 0.5, detail: `soil temperature reads ${round1(t)} °C, which is not plausible` })
    note(last.timestamp)
  }

  // Flatline: walk back from the newest reading while the value has not moved.
  let i = rs.length - 1
  while (i > 0 && Math.abs(rs[i - 1].soilMoisturePercent - last.soilMoisturePercent) <= LIMITS.flatEps) i--
  const run = rs.length - i
  const spanH = (lastT - Date.parse(rs[i].timestamp)) / H
  if (run >= LIMITS.flatMinReadings && spanH >= LIMITS.flatMinSpanH) {
    out.push({ kind: 'flatline', weight: 0.7, detail: `has reported ${round1(last.soilMoisturePercent)}% for ${Math.round(spanH)} h with no variation, so it is probably stuck` })
    note(rs[i].timestamp)
  }

  // Spike: a jump between consecutive readings, unless irrigation or heavy rain explains it.
  const rainToday = days[0]?.rainMm ?? 0
  let jump: { to: SensorReading; pp: number } | undefined
  for (let k = 1; k < rs.length; k++) {
    if (lastT - Date.parse(rs[k].timestamp) > LIMITS.spikeWindowH * H) continue
    const pp = rs[k].soilMoisturePercent - rs[k - 1].soilMoisturePercent
    if (Math.abs(pp) >= LIMITS.spikePp && (!jump || Math.abs(pp) > Math.abs(jump.pp))) jump = { to: rs[k], pp }
  }
  // Irrigation in this zone between `a - explainIrrigationH` and `b` explains a rise up to `b`.
  const irrigated = (a: number, b: number) => events.some((e) => {
    const et = Date.parse(e.timestamp)
    return e.zoneId === s.zoneId && et >= a - LIMITS.explainIrrigationH * H && et <= b
  })
  const explained = (r: SensorReading) => irrigated(Date.parse(r.timestamp), Date.parse(r.timestamp)) || rainToday >= LIMITS.explainRainMm
  let real = false
  if (jump) {
    const what = `jumped ${Math.abs(round1(jump.pp))} points ${jump.pp > 0 ? 'up' : 'down'} between two readings`
    if (jump.pp > 0 && explained(jump.to)) {
      real = true
      out.push({ kind: 'real-event', weight: 0, detail: `${what}, which matches recent rain or irrigation` })
    } else {
      out.push({ kind: 'spike', weight: 0.4, detail: `${what} with no rain or irrigation to explain it` })
      note(jump.to.timestamp)
    }
  } else {
    // Gradual rise with no water source.
    const from = rs.find((r) => lastT - Date.parse(r.timestamp) <= LIMITS.riseH * H)!
    const rise = last.soilMoisturePercent - from.soilMoisturePercent
    if (rise >= LIMITS.risePp && !irrigated(Date.parse(from.timestamp), lastT) && rainToday < LIMITS.explainRainMm) {
      out.push({ kind: 'implausible', weight: 0.3, detail: `rose ${round1(rise)} points in a day with no rain or irrigation` })
      note(from.timestamp)
    }
  }
  const d0 = days[0]
  if (typeof t === 'number' && d0 && (t < d0.tMinC - 10 || t > d0.tMaxC + 10))
    out.push({ kind: 'implausible', weight: 0.25, detail: `soil temperature ${round1(t)} °C is far from today's air range (${d0.tMinC}–${d0.tMaxC} °C)` })

  if (typeof last.batteryPercent === 'number' && last.batteryPercent < LIMITS.lowBattery)
    out.push({ kind: 'battery', weight: 0.2, detail: `battery is low (${last.batteryPercent}%), and weak batteries can distort readings` })
  return { out, since, real }
}

const ACTION: Record<string, string> = {
  flatline: 'Check that the probe is firmly in the soil and has power; take a manual reading to compare.',
  'out-of-range': 'Check the cable and connection, then re-seat or replace the probe.',
  spike: 'Take a manual reading. If the probe disagrees, re-seat it so it makes full contact with the soil.',
  'peer-disagree': 'Compare with a manual reading; check both probes are at the depth you expect.',
  implausible: 'Wait for the next reading, and take a manual reading if it keeps rising.',
  battery: 'Replace or recharge the battery.',
  'real-event': 'No action needed.',
}

/** Assess every sensor that has a recent reading. Sensors with no recent data are left out. */
export function assessSensors(
  sensors: Sensor[], readings: SensorReading[], days: WeatherDay[], events: IrrigationEvent[], now: number,
): Record<string, SensorAssessment> {
  const by = new Map<string, SensorReading[]>()
  for (const r of readings) if (r.sensorId) (by.get(r.sensorId) ?? by.set(r.sensorId, []).get(r.sensorId)!).push(r)
  const own = new Map<string, ReturnType<typeof ownSignals>>()
  const latest = new Map<string, number>()
  for (const s of sensors) {
    const rs = by.get(s.id)?.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    if (!rs?.length || now - Date.parse(rs[rs.length - 1].timestamp) > LIMITS.staleH * H) continue
    own.set(s.id, ownSignals(s, rs, days, events))
    latest.set(s.id, rs[rs.length - 1].soilMoisturePercent)
  }

  const out: Record<string, SensorAssessment> = {}
  for (const s of sensors) {
    const o = own.get(s.id)
    if (!o) continue
    const signals = [...o.out]
    // Peer check. With a single peer we cannot tell who is wrong, so blame only the one without other signals against it.
    const peers = sensors.filter((p) => p.id !== s.id && s.zoneId && p.zoneId === s.zoneId && latest.has(p.id))
    if (peers.length) {
      const dev = latest.get(s.id)! - median(peers.map((p) => latest.get(p.id)!))
      const peerSuspect = peers.length === 1 && own.get(peers[0].id)!.out.some((x) => x.weight > 0.2)
      if (Math.abs(dev) >= LIMITS.peerPp && !peerSuspect)
        signals.push({ kind: 'peer-disagree', weight: peers.length > 1 ? 0.45 : 0.35, detail: `reads ${round1(Math.abs(dev))} points ${dev > 0 ? 'higher' : 'lower'} than other probes in the same zone` })
    }
    const confidence = Math.max(0, Math.min(1, 1 - signals.reduce((t, x) => t + x.weight, 0)))
    const faults = signals.filter((x) => x.weight > 0)
    const verdict: TrustVerdict = confidence < LIMITS.faultyBelow ? 'likely-faulty'
      : confidence < LIMITS.trustedAt ? 'uncertain'
      : o.real && !faults.some((x) => x.kind !== 'battery') ? 'real-event' : 'trusted'
    const top = [...faults].sort((a, b) => b.weight - a.weight)[0]
    const lead = verdict === 'real-event' ? signals.find((x) => x.kind === 'real-event')! : top
    out[s.id] = {
      sensorId: s.id, verdict, confidence: round1(confidence * 100) / 100, signals,
      explanation: lead ? `${s.name} ${lead.detail}.` : `${s.name} looks healthy.`,
      action: lead ? ACTION[lead.kind] : 'No action needed.',
      since: o.since,
    }
  }
  return out
}
