import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { beforeAll, describe, expect, it } from 'vitest'

const coreEntry = fileURLToPath(new URL('../../../packages/core/src/index.ts', import.meta.url))
const productionEntry = `
  import { createForm, toRaw } from ${JSON.stringify(coreEntry)}
  const form = createForm({ initialValues: { user: { name: 'Ada' }, rows: [1] } })
  if (form.values !== toRaw(form.values)) throw new Error('development read-only view is enabled')
  form.batch(d => {
    d.user.$value.name = 'Grace'
    d.rows.$value.push(2)
  })
  console.log(JSON.stringify(await form.submit()))
`

describe('core-only Vite production bundle', () => {
  let code: string
  let modules: string[]

  beforeAll(async () => {
    const input = 'virtual:release-smoke'
    const result = await build({
      configFile: false,
      logLevel: 'silent',
      mode: 'production',
      define: { 'process.env.NODE_ENV': '"production"' },
      build: { target: 'esnext', modulePreload: false, write: false, rollupOptions: { input } },
      plugins: [{
        name: 'release-smoke',
        resolveId(id) { if (id === input) return `\0${input}` },
        load(id) { if (id === `\0${input}`) return productionEntry },
      }],
    })
    if (Array.isArray(result) || !('output' in result)) throw new Error('Expected a single Rollup output')
    const entry = result.output.find(chunk => chunk.type === 'chunk' && chunk.isEntry)
    if (!entry || entry.type !== 'chunk') throw new Error('Missing production entry chunk')
    code = entry.code
    modules = Object.keys(entry.modules)
  })

  it('submits draft edits with production semantics and no React modules', () => {
    expect(modules.some(id => /[\\/]core[\\/]src[\\/]engine[\\/]form-engine\.ts$/.test(id))).toBe(true)
    expect(modules.filter(id => /[\\/](react|react-dom|@tanstack)[\\/]/.test(id))).toEqual([])
    const result = execFileSync(process.execPath, ['--input-type=module'], {
      input: code,
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'development' },
      timeout: 5_000,
    })
    expect(JSON.parse(result)).toEqual({ user: { name: 'Grace' }, rows: [1, 2] })
  })

  it('QA-7 removes the development-only flag readback message from the production bundle', () => {
    expect(code.includes('after writing it in the same')).toBe(false)
  })
})

it.fails('BUG: neither publishable package declares a license in its manifest (QA-8)', () => {
  for (const name of ['core', 'react']) {
    const json = readFileSync(new URL(`../../../packages/${name}/package.json`, import.meta.url), 'utf8')
    const manifest = JSON.parse(json) as { license?: string }
    expect.soft(manifest.license ?? '', `@shikiform/${name} license`).toMatch(/\S/)
  }
})
