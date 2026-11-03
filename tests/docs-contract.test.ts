import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const script = path.resolve('scripts/check-docs-package.mjs')
const temporary: string[] = []

function fixture(files: Record<string, string>) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'shikiform-docs-inputs-'))
  temporary.push(root)
  for (const [name, source] of Object.entries(files)) {
    const file = path.join(root, name)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, source)
  }
  return root
}

afterEach(() => {
  for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('packed docs contract inputs', () => {
  it('has no teaching store or special package alias left behind', () => {
    expect(existsSync('src/runtime')).toBe(false)
    expect(readFileSync('docs-site/src/bridge/theme.tsx', 'utf8')).not.toContain('src/runtime')
    const component = readFileSync('docs-site/src/components/TutorialPlay.tsx', 'utf8')
    expect(component).toContain("answered ? tutorialFiles[id].solution : tutorialFiles[id].starter")
    expect(component).not.toContain('fields.tsx')
    expect(component).not.toContain('shikiform/ui')
    expect(component).not.toContain('shikiform/zod')
  })

  it('uses framework navigation only and keeps the tutorial sidebar in lesson order', () => {
    for (const directory of ['docs-site/src/content/docs/tutorial', 'docs-site/src/content/docs/guide']) {
      for (const file of readdirSync(directory).filter((file) => file.endsWith('.mdx'))) {
        expect(readFileSync(path.join(directory, file), 'utf8'), file).not.toMatch(/StepNav|tutorial-nav/)
      }
    }
    // Nimbus 用 astro.config.ts 里的手动侧边栏维护课序（index 独立条目在教程组之外）。
    const config = readFileSync('docs-site/astro.config.ts', 'utf8')
    const order = [...config.matchAll(/link: "\/tutorial\/([\w-]+)"/g)].map((match) => match[1])
    expect(order).toEqual([
      '1-start', '2-fields', '3-path', '4-state', '5-pattern', '6-reaction', '7-array', '8-watch', '9-rules', '10-next',
    ])
    expect(config).toContain('link: "/tutorial"')
    expect(readFileSync('docs-site/src/content/docs/tutorial/2-fields.mdx', 'utf8')).toContain('这一步')
  })

  it('includes each tutorial and its visible adapter plus both preview and live blocks', () => {
    const app = 'export default function App() { return <div /> }\n'
    const root = fixture({
      'tutorial/_files/01-start.tsx': app,
      'tutorial/_files/01-start.solution.tsx': app,
      'tutorial/_files/fields.tsx': 'export const Shared = () => <input />\n',
      'guide/example.mdx': [
        '# Example', '```tsx preview', 'export default () => <div>Preview</div>', '```',
        '```tsx live', 'export default () => <div>Live</div>', '```',
        '```tsx', 'This is an unexecuted API sketch', '```',
        '```tsx preview-like', 'This is not the preview flag', '```',
      ].join('\n'),
    })
    const sources = JSON.parse(execFileSync(process.execPath, [script, '--docs-dir', root, '--list'], { encoding: 'utf8' })) as Array<{ file: string; source: string; kind: string; sha256: string }>
    expect(sources.filter((source) => source.kind === 'tutorial').map((source) => source.file)).toEqual([
      'tutorial/_files/01-start.solution.tsx', 'tutorial/_files/01-start.tsx', 'tutorial/_files/fields.tsx',
    ])
    expect(sources.filter((source) => source.kind === 'inline').map((source) => source.source)).toEqual([
      'guide/example.mdx:2', 'guide/example.mdx:5',
    ])
    expect(sources.find((source) => source.file.endsWith('/01-start.tsx'))?.sha256).toBe(createHash('sha256').update(app).digest('hex'))
  })

  it('includes the README tsx sample when checking the real docs directory', () => {
    const sources = JSON.parse(execFileSync(process.execPath, [script, '--list'], { encoding: 'utf8' })) as Array<{ source: string }>
    expect(sources.some((source) => source.source.startsWith('README.md:'))).toBe(true)
    const readme = sources.filter((source) => source.source.startsWith('README.md:'))
    expect(readme).toHaveLength(1)
    expect(readme[0].source).toMatch(/^README\.md:\d+$/)
  })

  it('does not silently pass when the tutorial source directory is absent', () => {
    const root = fixture({ 'index.mdx': '# No tutorials' })
    const result = spawnSync(process.execPath, [script, '--docs-dir', root, '--list'], { encoding: 'utf8' })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('No tutorial TSX found')
  })
})
