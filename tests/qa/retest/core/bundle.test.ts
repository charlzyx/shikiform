import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { beforeAll, expect, it } from 'vitest'

const input = 'virtual:retest-readback'
const core = fileURLToPath(new URL('../../../../packages/core/src/index.ts', import.meta.url))
const source = `
  import { createForm } from ${JSON.stringify(core)}
  const form = createForm({ initialValues: { nested: { items: [1] } } })
  try {
    form.batch(d => {
      d.nested.items.$omit = true
      const previous = d.nested.items.$omit
      d.nested.items.$value.push(previous ? 9 : 2)
    })
    console.log(JSON.stringify({ payload: await form.submit(), values: form.values }))
  } catch (error) {
    console.log(JSON.stringify({ name: error.name, message: error.message, values: form.values }))
  }
`

const bundles = new Map<string, string>()

beforeAll(async () => {
  for (const mode of ['development', 'production']) {
    const result = await build({
      configFile: false,
      logLevel: 'silent',
      mode,
      define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
      build: { target: 'esnext', minify: false, modulePreload: false, write: false, rollupOptions: { input } },
      plugins: [{
        name: 'retest-readback',
        resolveId(id) { if (id === input) return '\0' + input },
        load(id) { if (id === '\0' + input) return source },
      }],
    })
    if (Array.isArray(result) || !('output' in result)) throw new Error('Expected one Rollup output')
    const entry = result.output.find(chunk => chunk.type === 'chunk' && chunk.isEntry)
    if (!entry || entry.type !== 'chunk') throw new Error('Missing entry chunk')
    bundles.set(mode, entry.code)
  }
})

it('QA-7 removes the flag diagnostic from unminified production while retaining it in development', () => {
  expect(bundles.get('production')).not.toContain('after writing it in the same')
  expect(bundles.get('development')).toContain('after writing it in the same')
})

it('QA-7 preserves development rollback and production flag semantics in the compiled bundles', () => {
  const run = (mode: string, runtime: string) => JSON.parse(execFileSync(process.execPath, ['--input-type=module'], {
    input: bundles.get(mode)!,
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: runtime },
    timeout: 5000,
  }))
  expect(run('development', 'production')).toEqual({
    name: 'ShikiUsageError',
    message: expect.stringContaining('d.nested.items.$omit after writing it in the same batch'),
    values: { nested: { items: [1] } },
  })
  expect(run('production', 'development')).toEqual({
    payload: { nested: {} },
    values: { nested: { items: [1, 2] } },
  })
})
