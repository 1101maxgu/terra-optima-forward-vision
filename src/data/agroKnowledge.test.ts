import { expect, it } from 'vitest'
import { CROPS } from './crops'
import { knowledgeText } from './agroKnowledge'

it('the reference library covers every crop and soil and matches the engine numbers', () => {
  const t = knowledgeText()
  for (const c of Object.values(CROPS)) {
    expect(t).toContain(`### ${c.name}`)
    expect(t).toContain(`${c.kc} at full growth`)
  }
  for (const soil of ['Sandy loam', 'Loam', 'Silt loam']) expect(t).toContain(soil)
  expect(t).toContain('Drip: about 90%')
})
