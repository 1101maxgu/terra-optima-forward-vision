import { expect, it } from 'vitest'
import { parseNominatim } from './geocode'

it('parses Nominatim jsonv2 hits and skips junk', () => {
  const places = parseNominatim([
    { display_name: 'Abbotsford, BC', lat: '49.05', lon: '-122.31', boundingbox: ['48.9', '49.2', '-122.5', '-122.1'] },
    { display_name: 'Broken', lat: 'x', lon: '1' },
    { lat: '1', lon: '1' },
  ])
  expect(places).toEqual([{ label: 'Abbotsford, BC', center: [-122.31, 49.05], bbox: [[-122.5, 48.9], [-122.1, 49.2]] }])
  expect(parseNominatim({ error: 'x' })).toEqual([])
})
