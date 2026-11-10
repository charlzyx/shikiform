#!/usr/bin/env node
/** Check the exact editable docs against an unpacked npm package, never TS paths or a docs alias. */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { visit } from 'unist-util-visit'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoDocs = path.join(root, 'docs-site', 'src', 'content', 'docs')
const args = process.argv.slice(2)
function option(name, fallback) {
  const index = args.indexOf(name)
  if (index < 0) return fallback
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Missing value for ${name}`)
  return path.resolve(args[index + 1])
}
const docs = option('--docs-dir', repoDocs)
const keepDir = option('--keep-dir', undefined)
const listOnly = args.includes('--list')
const supported = new Set(['--docs-dir', '--keep-dir', '--list'])
for (const arg of args.filter((value) => value.startsWith('--'))) {
  if (!supported.has(arg)) throw new Error(`Unknown option: ${arg}`)
}

function filesUnder(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const file = path.join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(file) : entry.isFile() ? [file] : []
  })
}

const sources = []
for (const file of filesUnder(path.join(docs, 'tutorial', '_files')).filter((file) => file.endsWith('.tsx'))) {
  sources.push({ source: path.relative(docs, file), file: path.relative(docs, file), code: readFileSync(file, 'utf8'), kind: 'tutorial' })
}
function pushCode(label, text, accept) {
  let index = 0
  visit(unified().use(remarkParse).parse(text), 'code', (node) => {
    if (!accept(node)) return
    sources.push({
      source: `${label}:${node.position.start.line}`,
      file: path.join('inline', label.replace(/\.mdx?$/, ''), `example-${++index}.tsx`),
      code: `${node.value}\n`, kind: 'inline',
    })
  })
}
const isPreview = (node) => ['tsx', 'jsx'].includes(node.lang) && /(?:^|\s)(preview|live)(?:\s|$)/.test(node.meta ?? '')
for (const file of filesUnder(docs).filter((file) => file.endsWith('.mdx'))) {
  pushCode(path.relative(docs, file), readFileSync(file, 'utf8'), isPreview)
}
// The GitHub README is the user intro. Its ```tsx blocks are the same samples as the
// quick-start previews; only the real docs dir is scanned, so fixture --docs-dir runs stay isolated.
if (path.resolve(docs) === path.resolve(repoDocs)) {
  const readme = path.join(root, 'README.md')
  if (existsSync(readme)) pushCode('README.md', readFileSync(readme, 'utf8'), (node) => ['tsx', 'jsx'].includes(node.lang))
}
if (!sources.some((source) => source.kind === 'tutorial')) throw new Error('No tutorial TSX found; refusing an empty contract check')
const manifest = sources.map(({ source, file, code, kind }) => ({ source, file, kind, sha256: createHash('sha256').update(code).digest('hex') }))
if (listOnly) {
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`)
  process.exit(0)
}
const packageNames = ['core', 'react', 'hooks', 'antd']
for (const name of packageNames) {
  if (!existsSync(path.join(root, 'packages', name, 'dist', 'index.d.ts'))) throw new Error('Run npm run build:lib before this check')
}
if (keepDir && existsSync(keepDir)) throw new Error(`Refusing to overwrite existing evidence: ${keepDir}`)
const work = keepDir ?? mkdtempSync(path.join(os.tmpdir(), 'shikiform-docs-package-'))
mkdirSync(work, { recursive: true })
const consumer = path.join(work, 'consumer')
const modules = path.join(consumer, 'node_modules')
mkdirSync(modules, { recursive: true })
const summary = { sources: manifest, packageResolution: {}, dependencyIsolation: 'not-run', packageContexts: 'not-run', typecheck: 'not-run', build: 'not-run', ssr: 'not-run', ssrResults: [] }
const env = { ...process.env, npm_config_cache: path.join(work, 'npm-cache') }

function run(command, parameters, cwd, log) {
  try {
    const output = execFileSync(command, parameters, { cwd, env, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
    writeFileSync(path.join(work, log), output)
    return output
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`
    writeFileSync(path.join(work, log), output)
    process.stderr.write(output)
    throw new Error(`${command} ${parameters.join(' ')} failed (exit ${error.status ?? 'unknown'})`)
  }
}

try {
  const scopeDir = path.join(modules, '@shikiform')
  mkdirSync(scopeDir, { recursive: true })
  const packedDirs = {}
  const forbidden = {
    core: /^(react|react-dom|antd|dayjs)(\/|$)|@shikiform\/(react|hooks|antd)/,
    react: /^(antd|dayjs)(\/|$)|@shikiform\/(hooks|antd)/,
    hooks: /^(antd|dayjs)(\/|$)|@shikiform\/antd/,
    antd: null,
  }
  for (const name of packageNames) {
    const sourceDir = path.join(root, 'packages', name)
    const packed = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', work], sourceDir, `pack-${name}.log`))
    if (packed.length !== 1 || path.basename(packed[0].filename) !== packed[0].filename) throw new Error(`Unexpected npm pack result for ${name}`)
    const packageDir = path.join(scopeDir, name)
    mkdirSync(packageDir)
    run('tar', ['-xzf', path.join(work, packed[0].filename), '-C', packageDir, '--strip-components=1'], root, `unpack-${name}.log`)
    const pkg = JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8'))
    if (pkg.name !== `@shikiform/${name}`) throw new Error(`Unexpected packed package: ${pkg.name}`)
    const packageDirReal = realpathSync(packageDir)
    packedDirs[pkg.name] = packageDirReal
    const exportKeys = Object.keys(pkg.exports ?? {})
    if (!exportKeys.includes('.')) throw new Error(`${pkg.name} is missing the "." export`)
    for (const key of exportKeys) {
      for (const condition of ['types', 'import']) {
        const target = pkg.exports?.[key]?.[condition]
        if (typeof target !== 'string') throw new Error(`Missing public ${pkg.name} ${key} ${condition} export`)
        const actual = realpathSync(path.resolve(packageDir, target))
        if (!actual.startsWith(`${packageDirReal}${path.sep}`)) throw new Error(`Export escapes the package: ${pkg.name} ${key}`)
      }
    }
    const rule = forbidden[name]
    for (const entry of exportKeys) {
      const visited = new Set()
      const visitModule = (file) => {
        const actual = realpathSync(file)
        if (!actual.startsWith(`${packageDirReal}${path.sep}`)) throw new Error(`Chunk escapes package: ${file}`)
        if (visited.has(actual)) return
        visited.add(actual)
        const code = readFileSync(actual, 'utf8')
        for (const match of code.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) {
          const dependency = match[1]
          if (rule && rule.test(dependency)) throw new Error(`${pkg.name} ${entry} unexpectedly imports ${dependency}`)
          if (dependency.startsWith('.')) visitModule(path.resolve(path.dirname(actual), dependency))
        }
      }
      visitModule(path.resolve(packageDir, pkg.exports[entry].import))
    }
  }
  summary.dependencyIsolation = 'passed'
  // Third-party packages are reused offline. The four packages are real tarball
  // extractions: no link to the checkout, no workspace package, and no TS paths.
  for (const entry of readdirSync(path.join(root, 'node_modules'))) {
    if (entry.startsWith('.') || entry === '@shikiform') continue
    symlinkSync(realpathSync(path.join(root, 'node_modules', entry)), path.join(modules, entry), 'junction')
  }
  writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ name: 'shikiform-docs-consumer', private: true, type: 'module' }, null, 2))
  for (const source of sources) {
    const target = path.join(consumer, source.file)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, source.code)
  }
  writeFileSync(path.join(consumer, 'package-context.tsx'), readFileSync(path.join(root, 'scripts/fixtures/package-context.tsx'), 'utf8'))
  writeFileSync(path.join(consumer, 'public-entrypoints.ts'), [
    "import * as form from '@shikiform/react'", "import * as core from '@shikiform/core'",
    "import * as pro from '@shikiform/hooks'", "import * as antd from '@shikiform/antd'",
    'export const publicEntrypoints = { form, core, pro, antd }',
  ].join('\n'))
  writeFileSync(path.join(consumer, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', jsx: 'react-jsx', strict: true, skipLibCheck: true, noEmit: true, types: ['react', 'node'] },
    include: ['**/*.ts', '**/*.tsx'], exclude: ['node_modules', 'dist'],
  }, null, 2))
  const entries = sources.map((source, index) => `import * as example${index} from ${JSON.stringify(`./${source.file.split(path.sep).join('/').replace(/\.tsx$/, '')}`)}`)
  writeFileSync(path.join(consumer, 'entry.tsx'), [...entries,
    "import { publicEntrypoints } from './public-entrypoints'",
    `console.log('Packed public modules and editable examples', publicEntrypoints, [${sources.map((_, index) => `example${index}`).join(', ')}])`,
  ].join('\n'))
  // This is an additional Node execution check, not browser interaction or
  // hydration evidence. The same packed library and exact source copies run.
  writeFileSync(path.join(consumer, 'ssr-entry.tsx'), [...entries,
    "import { verifyPackageContexts } from './package-context'",
    "import { createElement, type ComponentType } from 'react'",
    "import { renderToString } from 'react-dom/server'",
    'const examples: Array<{ source: string; exports: object }> = [',
    ...sources.map((source, index) => `  { source: ${JSON.stringify(source.source)}, exports: example${index} },`),
    ']',
    'const results = examples.map(({ source, exports }) => {',
    "  if (!('default' in exports)) throw new Error(`${source}: editable example has no default component`)",
    '  try {',
    '    const component = exports.default as ComponentType',
    '    const html = renderToString(createElement(component))',
    "    return { source, status: 'rendered', htmlBytes: Buffer.byteLength(html) }",
    '  } catch (error) {',
    '    throw new Error(`${source}: ${error instanceof Error ? error.message : error}`)',
    '  }',
    '})',
    "process.stdout.write(`${JSON.stringify({ results, packageContexts: verifyPackageContexts() })}\\n`)",
  ].join('\n'))
  writeFileSync(path.join(consumer, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module" src="/entry.tsx"></script></body></html>')
  writeFileSync(path.join(consumer, 'vite.config.mjs'), "export default { esbuild: { jsx: 'automatic' }, build: { outDir: 'dist', emptyOutDir: true } }\n")
  summary.packageResolution = JSON.parse(run(process.execPath, ['--input-type=module', '-e',
    "console.log(JSON.stringify(Object.fromEntries(['@shikiform/react','@shikiform/core','@shikiform/hooks','@shikiform/antd'].map(name => [name,import.meta.resolve(name)]))))"], consumer, 'resolution.log'))
  for (const [name, resolved] of Object.entries(summary.packageResolution)) {
    const packedUrl = pathToFileURL(`${packedDirs[name]}${path.sep}`).href
    if (!resolved.startsWith(packedUrl)) throw new Error(`Consumer resolved outside packed package: ${name} → ${resolved}`)
  }
  console.log(`Checking ${sources.filter((source) => source.kind === 'tutorial').length} tutorial files + ${sources.filter((source) => source.kind === 'inline').length} executable MDX blocks against npm pack exports`)
  summary.typecheck = 'running'
  run(process.execPath, [path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', path.join(consumer, 'tsconfig.json')], consumer, 'typecheck.log')
  summary.typecheck = 'passed'
  summary.build = 'running'
  run(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', path.join(consumer, 'vite.config.mjs')], consumer, 'build.log')
  summary.build = 'passed'
  summary.ssr = 'running'
  run(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', path.join(consumer, 'vite.config.mjs'), '--ssr', 'ssr-entry.tsx', '--outDir', 'ssr-dist'], consumer, 'ssr-build.log')
  const rendered = JSON.parse(run(process.execPath, [path.join(consumer, 'ssr-dist', 'ssr-entry.js')], consumer, 'ssr-render.log'))
  summary.ssrResults = rendered.results
  summary.packageContexts = rendered.packageContexts
  if (!summary.ssrResults.some((result) => result.status === 'rendered')) throw new Error('No example components were rendered')
  summary.ssr = 'passed'
  console.log(`Packed-package docs typecheck, production bundle, and ${summary.ssrResults.filter((result) => result.status === 'rendered').length} SSR renders passed (no paths / aliases; not a browser test)`)
  console.log(`Packed cross-entry context contracts passed: ${summary.packageContexts.length}; core/headless dependency isolation passed`)
} catch (error) {
  if (summary.typecheck === 'running') summary.typecheck = 'failed'
  if (summary.build === 'running') summary.build = 'failed'
  if (summary.ssr === 'running') summary.ssr = 'failed'
  summary.error = error.message
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
} finally {
  writeFileSync(path.join(work, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
  if (keepDir) console.log(`Evidence kept at ${work}`)
  else rmSync(work, { recursive: true, force: true })
}
