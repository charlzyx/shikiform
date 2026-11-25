import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The packages an editable demo may import. A Vite virtual module maps each name to a lazy `import()`, so the
 * page only downloads what a demo actually requires, and every demo shares the site's single React copy.
 */
const SITE_PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../package.json')

export const DEMO_IMPORTS = [
  'react',
  'react/jsx-runtime',
  '@shikiform/react',
  '@shikiform/core',
  'zod',
  '@ui-sdk/react/select',
  '@ui-sdk/react/checkbox',
  '@ui-sdk/react/radio',
  '@ui-sdk/react/slider',
  '@ui-sdk/react/date-picker',
  '@ui-sdk/react/dialog',
  '@ui-sdk/react/tabs',
] as const

export const DEMO_IMPORTS_ID = 'virtual:shikiform-demo-imports'

export function demoImports() {
  const resolved = `\0${DEMO_IMPORTS_ID}`
  return {
    name: 'shikiform-demo-imports',
    async resolveId(this: { resolve: (source: string, importer?: string, options?: { skipSelf?: boolean }) => Promise<unknown> }, source: string, importer?: string) {
      if (source === DEMO_IMPORTS_ID) return resolved
      if (importer === resolved && source.startsWith('@ui-sdk/')) {
        return this.resolve(source, SITE_PKG, { skipSelf: true })
      }
    },
    load(source: string) {
      if (source !== resolved) return
      const loaders = DEMO_IMPORTS.map((name) => `  ${JSON.stringify(name)}: () => import(${JSON.stringify(name)}),`)
      return `const loaders = {\n${loaders.join('\n')}\n};
export const names = Object.keys(loaders);
export function loadImport(name) {
  const load = loaders[name];
  if (!load) return Promise.reject(new Error('示例不能导入 ' + name + '，可用：' + names.join('、')));
  return load();
}\n`
    },
  }
}
