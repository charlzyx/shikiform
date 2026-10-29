/** Public runtime integration seam; no copy or deep import of its compiler. */
export function liveDemoExternals() {
  const id = '_live_demo_virtual_modules'
  const virtual = '\0shikiform-live-demo-externals'
  return {
    name: 'shikiform-live-demo-externals',
    resolveId(source: string) { if (source === id) return virtual },
    load(source: string) {
      if (source !== virtual) return
      return `
const loaders = {
  'react': () => import('react'),
  'react/jsx-runtime': () => import('react/jsx-runtime'),
  'shikiform': () => import('shikiform'),
  'shikiform/core': () => import('shikiform/core'),
  'shikiform/pro': () => import('shikiform/pro'),
  'shikiform/antd': () => import('shikiform/antd'),
  'antd': () => import('antd'),
  'zod': () => import('zod')
};
const resolved = new Map();
export async function loadImports(names) {
  await Promise.all(names.map(async name => {
    if (!loaders[name]) throw new Error('Dependency not included in this demo: ' + name);
    if (!resolved.has(name)) resolved.set(name, await loaders[name]());
  }));
}
export default function getImport(name) {
  if (!resolved.has(name)) throw new Error('Dependency not loaded: ' + name);
  return resolved.get(name);
}`
    },
  }
}
