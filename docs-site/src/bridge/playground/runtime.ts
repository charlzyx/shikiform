import type { ComponentType } from 'react'
import { loadImport } from 'virtual:shikiform-demo-imports'

/** File name → source. The entry file's default export is the demo. */
export type DemoFiles = Readonly<Record<string, string>>

type Module = { exports: Record<string, unknown> }

const EXTENSIONS = ['', '.tsx', '.ts', '.jsx', '.js']
const REQUIRE = /\brequire\((['"])([^'"]+)\1\)/g
const SOURCE = /\.[jt]sx?$/

let sucrase: Promise<typeof import('sucrase')['transform']> | undefined
// Loaded on first compile: a page without an edited demo never downloads the compiler.
const transformer = () => (sucrase ??= import('sucrase').then((module) => module.transform))

/** `./fields` → `fields.tsx`, the same extension order TypeScript resolves. */
export function resolveFile(files: DemoFiles, specifier: string): string | undefined {
  const name = specifier.replace(/^\.\//, '')
  return EXTENSIONS.map((extension) => name + extension).find((candidate) => Object.hasOwn(files, candidate))
}

/**
 * Sucrase's interop reads `default` only from a module flagged `__esModule`.
 * A dynamic-import namespace has `default` (React's CommonJS export) but no flag.
 */
function asCommonJs(namespace: Record<string, unknown>): Record<string, unknown> {
  return { ...namespace, __esModule: true }
}

/**
 * Compile trusted demo files and return the entry's default export.
 * Each file is one CommonJS module (Sucrase `imports` transform), so relative imports between files work and
 * packages come from the site's own bundle. Rejects with a message fit to show under the preview.
 */
export async function compileDemo(files: DemoFiles, entry: string): Promise<ComponentType> {
  const transform = await transformer()
  const compiled = new Map<string, string>()
  const packages = new Set<string>()
  for (const [file, source] of Object.entries(files)) {
    if (!SOURCE.test(file)) continue
    const { code } = transform(source, {
      transforms: ['typescript', 'jsx', 'imports'],
      jsxRuntime: 'automatic',
      production: true,
      disableESTransforms: true,
      filePath: file,
    })
    compiled.set(file, code)
    for (const match of code.matchAll(REQUIRE)) if (!match[2].startsWith('.')) packages.add(match[2])
  }
  if (!compiled.has(entry)) throw new Error(`缺少入口文件 ${entry}`)
  const loaded = new Map(
    await Promise.all([...packages].map(async (name) => [name, asCommonJs(await loadImport(name))] as const)),
  )

  const modules = new Map<string, Module>()
  const run = (file: string): Record<string, unknown> => {
    const cached = modules.get(file)
    if (cached) return cached.exports
    const module: Module = { exports: {} }
    modules.set(file, module)
    const require = (specifier: string) => {
      if (!specifier.startsWith('.')) return loaded.get(specifier)
      const target = resolveFile(files, specifier)
      if (!target || !compiled.has(target)) throw new Error(`${file} 导入的 ${specifier} 不存在`)
      return run(target)
    }
    // Trusted, same-origin documentation examples only; this is not a sandbox.
    new Function('require', 'module', 'exports', compiled.get(file)!)(require, module, module.exports)
    return module.exports
  }

  const component = run(entry).default
  const renderable = typeof component === 'function' || (typeof component === 'object' && component !== null)
  if (!renderable) throw new Error(`${entry} 需要 export default 一个 React 组件`)
  return component as ComponentType
}
