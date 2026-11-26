/**
 * Vite 插件：
 * 1. `virtual:shikiform-demo-imports` — 可编辑示例允许 import 的包 → 懒加载映射；
 * 2. `*?shikiform-demo` — build 时用 esbuild 编译 preview 围栏源码，SSR/首屏直出。
 */
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { transformWithEsbuild } from 'vite'

const DOCS = path.resolve(import.meta.dirname, '../content/docs')
const SITE_UI = path.resolve(import.meta.dirname, '../ui/index.ts')


/** 扫描教程练习文件：01-start → { starter, solution }。 */
async function tutorialPairs(locale = '') {
  const directory = path.join(DOCS, locale, 'tutorial', '_files')
  const names = new Set()
  try {
    for (const name of await readdir(directory)) {
      if (name.endsWith('.tsx')) names.add(name.replace(/\.solution\.tsx$/, '').replace(/\.tsx$/, ''))
    }
  } catch {
    return {}
  }
  const pairs = {}
  for (const name of names) {
    pairs[locale ? `${locale}-${name}` : name] = {
      starter: await readFile(path.join(directory, `${name}.tsx`), 'utf8'),
      solution: await readFile(path.join(directory, `${name}.solution.tsx`), 'utf8').catch(() => ''),
    }
  }
  return pairs
}

/** 虚拟模块：教程练习的起始代码和参考写法。 */
export function shikiformTutorials() {
  const virtualId = 'virtual:shikiform-tutorials'
  const resolved = '\0' + virtualId
  return {
    name: 'shikiform-tutorials',
    resolveId(source) {
      if (source === virtualId) return resolved
    },
    async load(source) {
      if (source !== resolved) return
      const pairs = { ...await tutorialPairs(), ...await tutorialPairs('en') }
      return `export default ${JSON.stringify(pairs)}\n`
    },
  }
}


const DEMO_IMPORTS = [
  'react', 'react/jsx-runtime',
  '@shikiform/react', '@shikiform/core',
  '@site/ui',
  'zod',
  '@ui-sdk/react/button', '@ui-sdk/react/input', '@ui-sdk/react/number-input',
  '@ui-sdk/react/textarea', '@ui-sdk/react/select', '@ui-sdk/react/combobox',
  '@ui-sdk/react/checkbox', '@ui-sdk/react/radio', '@ui-sdk/react/switch',
  '@ui-sdk/react/slider', '@ui-sdk/react/date-picker', '@ui-sdk/react/dialog',
  '@ui-sdk/react/drawer', '@ui-sdk/react/popover', '@ui-sdk/react/tabs',
  '@ui-sdk/react/tooltip', '@ui-sdk/react/pagination', '@ui-sdk/react/separator',
  '@ui-sdk/react/toolbar', '@ui-sdk/react/field', '@ui-sdk/react/label',
]

/** 递归列出 docs 下的 .mdx 文件（相对路径）。 */
async function mdxFiles(dir, prefix = '') {
  const entries = await readdir(path.join(dir, prefix), { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) files.push(...await mdxFiles(dir, relative))
    else if (entry.name.endsWith('.mdx')) files.push(relative)
  }
  return files
}

/** 提取一份 mdx 里所有 preview 围栏源码（顺序与 remark 插件一致）。 */
async function previewFences(relative) {
  const text = await readFile(path.join(DOCS, relative), 'utf8')
  const fences = []
  let inFence = false
  let fenceChar = ''
  let lang = ''
  let meta = ''
  let collected = []
  for (const line of text.split('\n')) {
    const open = line.match(/^(`{3,}|~{3,})\s*([\w-]+)?\s*(.*)$/)
    if (open && !inFence) {
      inFence = true
      fenceChar = open[1][0]
      lang = open[2] ?? ''
      meta = open[3] ?? ''
      collected = []
      continue
    }
    if (inFence && line.trimEnd().startsWith(fenceChar.repeat(3))) {
      inFence = false
      if (['tsx', 'jsx'].includes(lang) && /(?:^|\s)preview(?:\s|$)/.test(meta)) fences.push(collected.join('\n'))
      continue
    }
    if (inFence) collected.push(line)
  }
  return fences
}

/** demo id（与 src/mdx/demo-shared.mjs 一致）。 */
const demoId = (file, index) => `demo-${file.replace(/[^a-z\d_-]/gi, '-')}-${index}`

/** Sätteri 插件拿到绝对路径；这里按相对路径注册，先过同一个字符白名单再拼前缀。 */
function registeredId(relative, index) {
  const prefix = demoId(path.join(DOCS), 0).replace(/-0$/, '-')
  const flat = demoId(relative, 0).replace(/^demo-/, '').replace(/-0$/, '')
  return `${prefix}${flat}-${index}`
}

export function shikiformDemoImports() {
  const virtualId = 'virtual:shikiform-demo-imports'
  const resolved = '\0' + virtualId
  const loaders = DEMO_IMPORTS.map((name) => `  ${JSON.stringify(name)}: () => import(${JSON.stringify(name)}),`).join('\n')
  return {
    name: 'shikiform-demo-imports',
    resolveId(source) {
      if (source === virtualId) return resolved
      if (source === '@site/ui') return SITE_UI
    },
    load(source) {
      if (source !== resolved) return
      return `const loaders = {\n${loaders}\n};
export const names = Object.keys(loaders);
export function loadImport(name) {
  const load = loaders[name];
  if (!load) return Promise.reject(new Error('示例不能导入 ' + name + '，可用：' + names.join('、')));
  return load();
}\n`
    },
  }
}

/**
 * 虚拟模块：demo id → 编译后的组件。
 * Demo island 自己按 id 取组件（client:load 的 props 只能序列化字符串，函数传不进去），
 * 服务端同一份映射保证 SSR 直出。
 */
export function shikiformDemoComponentMap() {
  const virtualId = 'virtual:shikiform-demo-components'
  const resolved = '\0' + virtualId
  return {
    name: 'shikiform-demo-component-map',
    resolveId(source) {
      if (source === virtualId) return resolved
    },
    async load(source) {
      if (source !== resolved) return
      const entries = []
      const ids = []
      for (const relative of await mdxFiles(DOCS)) {
        (await previewFences(relative)).forEach((code, index) => {
          const id = registeredId(relative, index)
          ids.push(id)
          // 字面量 import：Vite/Rolldown 能静态分析并各自分包
          entries.push(id)
        })
      }
      if (entries.length === 0) return 'export default {}\n'
      const imports = entries.map((_, index) => `import c${index} from '?shikiform-demo=${ids[index]}.tsx';`).join('\n')
      const body = entries.map((_, index) => `  ${JSON.stringify(ids[index])}: c${index},`).join('\n')
      return `${imports}\n\nexport default {\n${body}\n}\n`
    },
  }
}

export function shikiformPreviews() {
  const modules = new Map()
  // 懒扫描：Rolldown 的 worker 线程各自持有插件实例，buildStart 不保证在
  // 每个线程都跑过；load 里自己保证扫描恰好一次。
  let scanned
  const ensureModules = () => (scanned ??= (async () => {
    for (const relative of await mdxFiles(DOCS)) {
      const fences = await previewFences(relative)
      fences.forEach((code, index) => modules.set(registeredId(relative, index), { code, relative }))
    }
  })())
  return {
    name: 'shikiform-previews',
    enforce: 'pre',
    buildStart() {
      void ensureModules()
    },
    resolveId(source) {
      const match = source.match(/^(.*)\?shikiform-demo=(demo-[\w-]+)\.tsx$/)
      if (match) return '\0' + match[2]
    },
    async load(id) {
      if (!id.startsWith('\0demo-')) return
      await ensureModules()
      const entry = modules.get(id.slice(1))
      if (!entry) throw new Error(`Missing demo module: ${id}`)
      const result = await transformWithEsbuild(entry.code, `${entry.relative}.demo.tsx`, { loader: 'tsx', jsx: 'automatic' })
      return { code: result.code, map: result.map }
    },
  }
}
