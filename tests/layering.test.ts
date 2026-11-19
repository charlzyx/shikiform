import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/** Guard the one-way module layout described in design/ARCHITECTURE.md. */
const PACKAGES = ['core', 'react', 'hooks'] as const
const ROOTS = PACKAGES.map((name) => ({ name, dir: path.resolve('packages', name, 'src') }))

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return files(full)
    return /\.tsx?$/.test(name) && !name.endsWith('.d.ts') ? [full] : []
  })
}

function resolve(from: string, spec: string): string | undefined {
  const base = path.resolve(path.dirname(from), spec)
  for (const candidate of [base + '.ts', base + '.tsx', path.join(base, 'index.ts')]) {
    try {
      if (statSync(candidate).isFile()) return candidate
    } catch {}
  }
  return undefined
}

const graph = new Map<string, string[]>()
for (const file of ROOTS.flatMap(({ dir }) => files(dir))) {
  const code = readFileSync(file, 'utf8')
  const deps = [...code.matchAll(/(?:from|import)\s*'(\.[^']+)'/g)]
    .map((match) => resolve(file, match[1]!))
    .filter((dep): dep is string => !!dep)
  graph.set(file, deps)
}
const rel = (file: string) => {
  for (const { name, dir } of ROOTS) {
    const inner = path.relative(dir, file)
    if (!inner.startsWith('..') && !path.isAbsolute(inner)) return `${name}/${inner.split(path.sep).join('/')}`
  }
  return path.relative(path.resolve('packages'), file).split(path.sep).join('/')
}

/** Rank of each stateful core part. A part may only import parts of a lower rank (or pure modules). */
const CORE_RANK: Record<string, number> = {
  state: 0,
  effects: 1,
  validation: 2,
  declarations: 3,
  structure: 4,
  engine: 5,
}
const PURE = ['core/shared/', 'core/enum/', 'core/draft/', 'core/types', 'core/errors', 'core/validation/rules', 'core/validation/schema', 'core/validation/messages']

describe('module layering', () => {
  it('has no import cycles', () => {
    const state = new Map<string, number>()
    const cycles: string[] = []
    const visit = (file: string, stack: string[]) => {
      state.set(file, 1)
      stack.push(file)
      for (const dep of graph.get(file) ?? []) {
        if (state.get(dep) === 1) cycles.push([...stack.slice(stack.indexOf(dep)), dep].map(rel).join(' -> '))
        else if (!state.get(dep)) visit(dep, stack)
      }
      stack.pop()
      state.set(file, 2)
    }
    for (const file of graph.keys()) if (!state.get(file)) visit(file, [])
    expect(cycles).toEqual([])
  })

  it('stateful core parts only depend downward', () => {
    const violations: string[] = []
    for (const [file, deps] of graph) {
      const from = rel(file)
      const fromPart = from.split('/')[1]
      if (!from.startsWith('core/') || !(fromPart! in CORE_RANK) || PURE.some((p) => from.startsWith(p))) continue
      for (const dep of deps.map(rel)) {
        if (PURE.some((p) => dep.startsWith(p))) continue
        const toPart = dep.split('/')[1]!
        if (!(toPart in CORE_RANK) || toPart === fromPart) continue
        if (CORE_RANK[toPart]! >= CORE_RANK[fromPart!]!) violations.push(`${from} -> ${dep}`)
      }
    }
    expect(violations).toEqual([])
  })

  it('core imports no React, react and hooks import no UI libraries, pure modules import no stateful part', () => {
    const rank: Record<string, number> = { core: 0, react: 1, hooks: 2 }
    const violations: string[] = []
    for (const [file, deps] of graph) {
      const from = rel(file)
      const code = readFileSync(file, 'utf8')
      const fromPkg = from.split('/')[0]!
      if (fromPkg === 'core' && /from '(react|react-dom|antd|dayjs)/.test(code)) violations.push(`${from} imports a UI package`)
      if ((fromPkg === 'react' || fromPkg === 'hooks') && /from '(antd|dayjs)/.test(code)) violations.push(`${from} imports antd or dayjs`)
      for (const match of code.matchAll(/from '(@shikiform\/[a-z]+)/g)) {
        const dep = match[1]!.slice('@shikiform/'.length)
        if (!(dep in rank) || rank[dep]! >= rank[fromPkg]!) violations.push(`${from} imports ${match[1]}`)
      }
      if (PURE.some((p) => from.startsWith(p))) {
        for (const dep of deps.map(rel)) {
          const part = dep.split('/')[1]!
          if (part in CORE_RANK && !PURE.some((p) => dep.startsWith(p))) violations.push(`${from} -> ${dep}`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('keeps every core file under 700 lines', () => {
    const big = [...graph.keys()]
      .filter((file) => rel(file).startsWith('core/'))
      .map((file) => [rel(file), readFileSync(file, 'utf8').split('\n').length] as const)
      .filter(([, lines]) => lines > 700)
    expect(big).toEqual([])
  })
})
