// STUB — Agent C replaces with Open-Meteo fetch + localStorage cache + bundled fallback.
import type { Weather } from '../types'
import sample from '../data/sampleWeather.json'

/** Never throws. Live → cache → bundled. */
export async function getWeather(lat: number, lon: number): Promise<Weather> {
  void lat
  void lon
  return { days: sample.days, source: 'bundled', provenance: 'simulated' }
}
