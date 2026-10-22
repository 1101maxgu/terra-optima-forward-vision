import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseReadingsCsv } from './csv'

const ZONES = ['a', 'b', 'c']

describe('parseReadingsCsv', () => {
  it('parses a valid file (any column order, case-insensitive header, quotes, blank lines)', () => {
    const csv = 'Zone,DATE,moisture,soil_temp_c\n"A",2026-07-14T07:00:00-07:00,0.21,16\n\nb , 2026-07-14 , 0.18 , 15.5\n'
    const { readings, errors } = parseReadingsCsv(csv, ZONES)
    expect(errors).toEqual([])
    expect(readings).toHaveLength(2)
    expect(readings[0]).toEqual({
      zoneId: 'a',
      timestamp: '2026-07-14T14:00:00.000Z',
      moisture: 0.21,
      soilTempC: 16,
      provenance: 'measured',
    })
    expect(readings[1].zoneId).toBe('b')
    expect(Number.isNaN(Date.parse(readings[1].timestamp))).toBe(false)
  })

  it('converts percent and defaults missing soil temp to 15', () => {
    const { readings, errors } = parseReadingsCsv('date,zone,moisture\n2026-07-14,c,23', ZONES)
    expect(errors).toEqual([])
    expect(readings[0].moisture).toBeCloseTo(0.23)
    expect(readings[0].soilTempC).toBe(15)
  })

  it('reports unknown zone, bad date, bad moisture with line numbers; keeps good rows', () => {
    const csv = ['date,zone,moisture', '2026-07-14,a,20', '2026-07-14,z,20', '2026-02-30,a,20', '2026-07-14,b,abc', '2026-07-14,b,150'].join('\n')
    const { readings, errors } = parseReadingsCsv(csv, ZONES)
    expect(readings).toHaveLength(1)
    expect(errors[0]).toMatch(/^Line 3: zone 'z' is unknown \(valid: a, b, c\)/)
    expect(errors[1]).toMatch(/^Line 4: date '2026-02-30'/)
    expect(errors[2]).toBe("Line 5: moisture 'abc' is not a number")
    expect(errors[3]).toMatch(/^Line 6: moisture 150 is out of range/)
  })

  it('rejects present-but-invalid soil_temp_c', () => {
    const { readings, errors } = parseReadingsCsv('date,zone,moisture,soil_temp_c\n2026-07-14,a,20,warm', ZONES)
    expect(readings).toEqual([])
    expect(errors[0]).toMatch(/^Line 2: soil_temp_c 'warm'/)
  })

  it('missing header column', () => {
    const { readings, errors } = parseReadingsCsv('date,moisture\n2026-07-14,20', ZONES)
    expect(readings).toEqual([])
    expect(errors[0]).toMatch(/^Line 1: missing required column\(s\) zone/)
  })

  it('handles CRLF + BOM', () => {
    const bom = String.fromCharCode(0xfeff)
    const { readings, errors } = parseReadingsCsv(`${bom}date,zone,moisture\r\n2026-07-14,a,0.2\r\n2026-07-15,b,0.25\r\n`, ZONES)
    expect(errors).toEqual([])
    expect(readings.map((r) => r.zoneId)).toEqual(['a', 'b'])
  })

  it('empty file and header-only file', () => {
    expect(parseReadingsCsv('', ZONES).errors[0]).toMatch(/empty/)
    expect(parseReadingsCsv('  \n\n', ZONES).errors[0]).toMatch(/empty/)
    expect(parseReadingsCsv('date,zone,moisture\n', ZONES).errors[0]).toMatch(/no data rows/)
  })

  it('bundled public/sample-readings.csv parses cleanly', () => {
    const { readings, errors } = parseReadingsCsv(readFileSync('public/sample-readings.csv', 'utf8'), ZONES)
    expect(errors).toEqual([])
    expect(readings).toHaveLength(9)
  })

  it('caps at 5,000 rows', () => {
    const rows = Array.from({ length: 5002 }, () => '2026-07-14,a,20')
    const { readings, errors } = parseReadingsCsv(['date,zone,moisture', ...rows].join('\n'), ZONES)
    expect(readings).toHaveLength(5000)
    expect(errors).toEqual(['Line 5002: file exceeds 5,000 rows; this and later rows were ignored.'])
  })
})
