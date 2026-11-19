#!/usr/bin/env node
/** Guard documentation discoverability against the real public exports, not a hand-maintained API wish list. */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
function option(flag, fallback) {
  const index = args.indexOf(flag)
  if (index < 0) return fallback
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Missing ${flag} value`)
  return path.resolve(args[index + 1])
}
const docs = option('--docs-dir', path.join(root, 'docs-site', 'src', 'content', 'docs'))
const manifestFile = option('--manifest', path.join(docs, 'reference', 'exports.json'))
for (const arg of args.filter((arg) => arg.startsWith('--'))) {
  if (!['--docs-dir', '--manifest', '--list'].includes(arg)) throw new Error(`Unknown option ${arg}`)
}
const entries = {
  '@shikiform/react': 'packages/react/src/index.ts',
  '@shikiform/hooks': 'packages/hooks/src/index.ts',
}
const program = ts.createProgram(Object.values(entries).map((file) => path.join(root, file)), {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX, skipLibCheck: true, noEmit: true,
  baseUrl: root,
  paths: {
    '@shikiform/core': ['packages/core/src/index.ts'],
    '@shikiform/core/internal': ['packages/core/src/internal.ts'],
    '@shikiform/hooks': ['packages/hooks/src/index.ts'],
    '@shikiform/hooks/internal': ['packages/hooks/src/internal.ts'],
    '@shikiform/react': ['packages/react/src/index.ts'],
    '@shikiform/react/internal': ['packages/react/src/internal.ts'],
  },
})
const checker = program.getTypeChecker()
const actual = {}
for (const [module, file] of Object.entries(entries)) {
  const source = program.getSourceFile(path.join(root, file))
  const symbol = source && checker.getSymbolAtLocation(source)
  if (!symbol) throw new Error(`Cannot inspect ${module}`)
  actual[module] = checker.getExportsOfModule(symbol).filter((exported) => {
    const target = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
    if (!(target.flags & ts.SymbolFlags.Value)) return false
    return module !== '@shikiform/react' || /^use[A-Z]/.test(exported.name) || exported.name === 'typed'
  }).map((symbol) => symbol.name).sort()
}
if (args.includes('--list')) {
  process.stdout.write(`${JSON.stringify(actual, null, 2)}\n`)
  process.exit(0)
}
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
const errors = []
if (Object.keys(manifest).sort().join('|') !== Object.keys(entries).sort().join('|')) errors.push('Reference module set does not match public modules')
for (const [module, names] of Object.entries(actual)) {
  const mapped = manifest[module] ?? {}
  for (const name of names) if (!mapped[name]) errors.push(`Missing reference for ${module}:${name}`)
  for (const name of Object.keys(mapped)) if (!names.includes(name)) errors.push(`Not a public export in this scope: ${module}:${name}`)
  for (const name of names.filter((name) => mapped[name])) {
    const target = mapped[name]
    if (typeof target !== 'string' || !/^reference\/[a-z-]+\.mdx$/.test(target)) {
      errors.push(`Invalid reference path for ${module}:${name}`)
      continue
    }
    let source
    try { source = readFileSync(path.join(docs, target), 'utf8') }
    catch { errors.push(`Missing reference page ${target}`); continue }
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const heading = new RegExp(`^## ${escaped}(?:\\s.*)?$`, 'm')
    const start = source.search(heading)
    if (start < 0) { errors.push(`Missing named section ${target}#${name}`); continue }
    const after = source.slice(start).split('\n').slice(1).join('\n')
    const section = after.split(/^## /m)[0]
    if (!/```tsx?(?:\s|\n)/.test(section)) errors.push(`Missing signature code in ${target}#${name}`)
    if (section.replace(/\s/g, '').length < 100) errors.push(`Reference is only an index entry: ${target}#${name}`)
  }
}
if (errors.length) throw new Error(errors.join('\n'))
console.log(`API reference coverage passed: ${Object.values(actual).reduce((sum, names) => sum + names.length, 0)} public React hooks (+ typed) and hooks runtime exports`)
