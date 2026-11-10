import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('AGENTS.md / llms.txt', () => {
  it('covers the topics agents get wrong', () => {
    const text = readFileSync('AGENTS.md', 'utf8')
    for (const topic of ['Handle vs value', 'reaction vs watch', 'Rows and nodes: each', '$componentProps', 'Field + decorator + component', 'useRecord()', 'Correct vs incorrect']) {
      expect(text).toContain(topic)
    }
    expect(text.match(/\/\/ ✓/g)!.length).toBeGreaterThanOrEqual(5)
  })
})
