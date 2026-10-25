import { expect, it } from 'vitest'
import { fmtDepth, fmtVolume, localize } from './units'
import { runHours, runText } from '../data/methods'

it('formats metric and US units', () => {
  expect(fmtDepth(12, 'metric')).toBe('12 mm')
  expect(fmtDepth(25.4, 'imperial')).toBe('1 in')
  expect(fmtVolume(34220, 'metric')).toBe('34,220 L')
  expect(fmtVolume(3785.411784, 'imperial')).toBe('1,000 gal')
})

it('rewrites amounts inside engine sentences', () => {
  expect(localize('apply about 3,785 L. 25.4 mm of rain', 'imperial')).toBe('apply about 1,000 gal. 1 in of rain')
  expect(localize('apply about 3,785 L.', 'metric')).toBe('apply about 3,785 L.')
})

it('run time rounds to half hours with a half-hour minimum', () => {
  expect(runHours(9, 'drip')).toBe(3)
  expect(runHours(10, 'drip')).toBe(3.5)
  expect(runHours(1, 'sprinkler')).toBe(0.5)
  expect(runText(9, 'drip')).toBe('Run your drip system for about 3 hours')
  expect(runText(3, 'drip')).toBe('Run your drip system for about 1 hour')
  expect(runText(60, 'drip', 3)).toBe('Run your drip system for about 6.5 hours, 3 separate times')
})
