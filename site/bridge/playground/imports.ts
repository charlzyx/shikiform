/**
 * The packages an editable demo may import. A Vite virtual module maps each name to a lazy `import()`, so the
 * page only downloads what a demo actually requires, and every demo shares the site's single React / antd copy.
 */
export const DEMO_IMPORTS = [
  'react',
  'react/jsx-runtime',
  'shikiform',
  'shikiform/core',
  'shikiform/pro',
  'shikiform/antd',
  'antd',
  'zod',
] as const

export const DEMO_IMPORTS_ID = 'virtual:shikiform-demo-imports'

export function demoImports() {
  const resolved = `\0${DEMO_IMPORTS_ID}`
  return {
    name: 'shikiform-demo-imports',
    resolveId(source: string) {
      if (source === DEMO_IMPORTS_ID) return resolved
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
