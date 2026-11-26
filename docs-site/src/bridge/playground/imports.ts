import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The packages an editable demo may import. A Vite virtual module maps each name to a lazy `import()`, so the
 * page only downloads what a demo actually requires, and every demo shares the site's single React copy.
 */
const DIR = path.dirname(fileURLToPath(import.meta.url))
const SITE_PKG = path.resolve(DIR, '../../../package.json')
const SITE_UI_DIR = path.resolve(DIR, '../../ui')
const SITE_UI_ENTRY = path.join(SITE_UI_DIR, 'index.ts')

export const DEMO_IMPORTS = [
  'react',
  'react/jsx-runtime',
  '@shikiform/react',
  '@shikiform/core',
  '@site/ui',
  'zod',
  '@ui-sdk/react/button',
  '@ui-sdk/react/input',
  '@ui-sdk/react/number-input',
  '@ui-sdk/react/textarea',
  '@ui-sdk/react/select',
  '@ui-sdk/react/combobox',
  '@ui-sdk/react/checkbox',
  '@ui-sdk/react/radio',
  '@ui-sdk/react/switch',
  '@ui-sdk/react/slider',
  '@ui-sdk/react/date-picker',
  '@ui-sdk/react/dialog',
  '@ui-sdk/react/drawer',
  '@ui-sdk/react/popover',
  '@ui-sdk/react/tabs',
  '@ui-sdk/react/tooltip',
  '@ui-sdk/react/pagination',
  '@ui-sdk/react/separator',
  '@ui-sdk/react/toolbar',
  '@ui-sdk/react/field',
  '@ui-sdk/react/label',
] as const

export const DEMO_IMPORTS_ID = 'virtual:shikiform-demo-imports'

export function demoImports() {
  const resolved = `\0${DEMO_IMPORTS_ID}`
  return {
    name: 'shikiform-demo-imports',
    async resolveId(
      this: { resolve: (source: string, importer?: string, options?: { skipSelf?: boolean }) => Promise<unknown> },
      source: string,
      importer?: string,
    ) {
      if (source === DEMO_IMPORTS_ID) return resolved
      if (source === '@site/ui') return SITE_UI_ENTRY
      if (
        source.startsWith('@ui-sdk/') &&
        (importer === resolved || (importer != null && importer.startsWith(SITE_UI_DIR)))
      ) {
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
