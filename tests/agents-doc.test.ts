import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain .mjs script
import { render } from '../scripts/build-llms.mjs'

describe('AGENTS.md / llms.txt', () => {
  it('llms.txt (served at /llms.txt from docs/public) is AGENTS.md plus the header — run `node scripts/build-llms.mjs`', () => {
    expect(readFileSync('docs/public/llms.txt', 'utf8')).toBe(render())
  })

  it('covers the topics agents get wrong', () => {
    const text = readFileSync('AGENTS.md', 'utf8')
    for (const topic of ['Handle vs value', 'reaction vs watch', 'each / walk', '$componentProps', 'Field + decorator + component', 'useRecord()', 'Correct vs incorrect']) {
      expect(text).toContain(topic)
    }
    expect(text.match(/\/\/ ✓/g)!.length).toBeGreaterThanOrEqual(5)
  })
})
