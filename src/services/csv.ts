// STUB — Agent C implements. Expected columns: date,zone,moisture[,soil_temp_c]
import type { CsvResult } from '../types'

export function parseReadingsCsv(text: string, zoneIds: string[]): CsvResult {
  void text
  void zoneIds
  return { readings: [], errors: ['CSV import not implemented yet'] }
}
