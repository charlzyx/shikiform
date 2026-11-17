import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const directories: string[] = []
const script = path.resolve('scripts/check-api-reference.mjs')
function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'shikiform-reference-'))
  directories.push(dir)
  cpSync('docs-site/src/content/docs/reference', path.join(dir, 'reference'), { recursive: true })
  return dir
}
function check(dir: string) {
  return spawnSync(process.execPath, [script, '--docs-dir', dir], { encoding: 'utf8' })
}
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true })
})

// Each case spawns a full TypeScript program (~3s alone); under a loaded parallel run it can pass 5s.
describe('public Hook and adapter reference coverage', { timeout: 30_000 }, () => {
  it('maps every real public Hook, typed, and pro/antd export to a named signature section', () => {
    const result = check(path.resolve('docs-site/src/content/docs'))
    expect(result.status, result.stderr).toBe(0)
    // 计数从 exports.json 派生。公开 react hooks 收成 8 个（外加 typed、useFieldDecorator）之后是 67。
    const manifest = JSON.parse(readFileSync(path.resolve('docs-site/src/content/docs/reference/exports.json'), 'utf8'))
    const count = Object.values(manifest).reduce((sum: number, scope) => sum + Object.keys(scope as object).length, 0)
    expect(count).toBeGreaterThanOrEqual(67)
    expect(result.stdout).toContain(`${count} public`)
  })
  it('fails when an existing Hook disappears from the reference map', () => {
    const dir = fixture()
    const file = path.join(dir, 'reference/exports.json')
    const manifest = JSON.parse(readFileSync(file, 'utf8'))
    delete manifest['@shikiform/react'].useField
    writeFileSync(file, JSON.stringify(manifest))
    const result = check(dir)
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Missing reference for @shikiform/react:useField')
  })
  it('rejects an invented useRow export', () => {
    const dir = fixture()
    const file = path.join(dir, 'reference/exports.json')
    const manifest = JSON.parse(readFileSync(file, 'utf8'))
    manifest['@shikiform/react'].useRow = 'reference/react-hooks.mdx'
    writeFileSync(file, JSON.stringify(manifest))
    const result = check(dir)
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Not a public export in this scope: @shikiform/react:useRow')
  })
  it('does not count a landing-page link as a detailed API section', () => {
    const dir = fixture()
    const file = path.join(dir, 'reference/react-hooks.mdx')
    writeFileSync(file, readFileSync(file, 'utf8').replace(/^## useField$/m, '## A broken heading'))
    const result = check(dir)
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Missing named section reference/react-hooks.mdx#useField')
  })
})
