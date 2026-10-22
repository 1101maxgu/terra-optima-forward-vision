// CSV import of farmer readings. Columns (any order, case-insensitive): date,zone,moisture[,soil_temp_c]
import type { CsvResult, Reading } from '../types'

const MAX_ROWS = 5000
const DEFAULT_SOIL_TEMP_C = 15

/** Splits one CSV line; supports simple double-quoted fields with "" escapes. */
function splitLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') (cur += '"'), i++
      else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') out.push(cur.trim()), (cur = '')
    else cur += ch
  }
  out.push(cur.trim())
  return out
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/

/** ISO date or datetime -> ISO timestamp. Date-only and zone-less values are read as local time. */
function parseDate(s: string): string | null {
  const m = DATE_RE.exec(s)
  if (!m) return null
  const [y, mo, d, h = '0', mi = '0', sec = '0'] = m.slice(1)
  const cal = new Date(Date.UTC(+y, +mo - 1, +d))
  if (cal.getUTCMonth() !== +mo - 1 || cal.getUTCDate() !== +d || +h > 23 || +mi > 59 || +sec > 59) return null
  const t = m[4] ? Date.parse(s.replace(' ', 'T')) : new Date(+y, +mo - 1, +d).getTime()
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

/** Never throws. Returns valid rows plus human-readable, line-numbered errors. */
export function parseReadingsCsv(text: string, zoneIds: string[]): CsvResult {
  const readings: Reading[] = []
  const errors: string[] = []
  const src = text ?? ''
  const lines = (src.charCodeAt(0) === 0xfeff ? src.slice(1) : src).split(/\r?\n/) // strip BOM

  const headerIdx = lines.findIndex((l) => l.trim() !== '')
  if (headerIdx < 0) return { readings, errors: ['The file is empty. Expected a header row: date,zone,moisture[,soil_temp_c]'] }

  const header = splitLine(lines[headerIdx]).map((h) => h.toLowerCase())
  const col = (name: string) => header.indexOf(name)
  const missing = ['date', 'zone', 'moisture'].filter((c) => col(c) < 0)
  if (missing.length) {
    return {
      readings,
      errors: [`Line ${headerIdx + 1}: missing required column(s) ${missing.join(', ')}. Expected header: date,zone,moisture[,soil_temp_c]`],
    }
  }
  const iDate = col('date'), iZone = col('zone'), iMoist = col('moisture'), iTemp = col('soil_temp_c')
  const zoneMap = new Map(zoneIds.map((z) => [z.toLowerCase(), z]))

  let rows = 0
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue
    const ln = i + 1
    if (++rows > MAX_ROWS) {
      errors.push(`Line ${ln}: file exceeds ${MAX_ROWS.toLocaleString('en-CA')} rows; this and later rows were ignored.`)
      break
    }
    const f = splitLine(lines[i])
    const rowErrors: string[] = []

    const rawDate = f[iDate] ?? ''
    const timestamp = parseDate(rawDate)
    if (!timestamp) rowErrors.push(`date '${rawDate}' is not a valid ISO date (e.g. 2026-07-14 or 2026-07-14T07:00)`)

    const rawZone = f[iZone] ?? ''
    const zoneId = zoneMap.get(rawZone.toLowerCase())
    if (!zoneId) rowErrors.push(`zone '${rawZone}' is unknown (valid: ${zoneIds.join(', ')})`)

    const rawMoist = f[iMoist] ?? ''
    let moisture = rawMoist === '' ? NaN : Number(rawMoist)
    if (!Number.isFinite(moisture)) rowErrors.push(`moisture '${rawMoist}' is not a number`)
    else if (moisture < 0 || moisture > 100) rowErrors.push(`moisture ${rawMoist} is out of range (use 0–1 or 0–100%)`)
    else if (moisture > 1) moisture /= 100

    const rawTemp = iTemp >= 0 ? (f[iTemp] ?? '') : ''
    const soilTempC = rawTemp === '' ? DEFAULT_SOIL_TEMP_C : Number(rawTemp)
    if (!Number.isFinite(soilTempC) || soilTempC < -30 || soilTempC > 60) rowErrors.push(`soil_temp_c '${rawTemp}' is not a valid temperature`)

    if (rowErrors.length) errors.push(`Line ${ln}: ${rowErrors.join('; ')}`)
    else readings.push({ zoneId: zoneId!, timestamp: timestamp!, moisture, soilTempC, provenance: 'measured' })
  }

  if (rows === 0) errors.push('The file has a header but no data rows.')
  return { readings, errors }
}
