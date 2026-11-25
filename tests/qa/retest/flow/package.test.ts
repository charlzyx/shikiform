import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
type PackagePack = { name: string; filename: string; files: { path: string }[] }
const names = ['@shikiform/core', '@shikiform/react']
let destination: string
let packs: PackagePack[]

beforeAll(() => {
  destination = mkdtempSync(join(tmpdir(), 'shikiform-retest-pack-'))
  const args = ['pack', '--json', '--ignore-scripts', '--pack-destination', destination]
  for (const name of names) args.push('--workspace', name)
  packs = JSON.parse(execFileSync('npm', args, { cwd: root, encoding: 'utf8', timeout: 12_000 }))
}, 15_000)

afterAll(() => {
  if (destination) rmSync(destination, { recursive: true, force: true })
})

it('QA-8 lists one top-level license per packed workspace and declares MIT in both tarball manifests', () => {
  expect(packs.map(({ name }) => name).sort()).toEqual(names)
  for (const pack of packs) {
    expect(pack.files.map(({ path }) => path).filter((path) => /(^|\/)licen[cs]e/i.test(path))).toEqual(['LICENSE'])
    expect(JSON.parse(extract(pack, 'package.json'))).toMatchObject({ name: pack.name, license: 'MIT' })
  }
})

it('QA-8 archives the full repository MIT text and copyright notice in both tarballs', () => {
  const license = readFileSync(join(root, 'LICENSE'), 'utf8')
  expect(license).toContain('Copyright (c) 2026 charlzyx')
  expect(license).toContain('The above copyright notice and this permission notice shall be included')
  expect(license).toContain('THE SOFTWARE IS PROVIDED "AS IS"')
  for (const pack of packs) expect(extract(pack, 'LICENSE')).toBe(license)
})

function extract(pack: PackagePack, entry: string): string {
  return execFileSync('tar', ['-xOf', join(destination, pack.filename), `package/${entry}`], {
    encoding: 'utf8',
    timeout: 5000,
  })
}
