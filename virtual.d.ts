// docs-site 的 Vite 虚拟模块在根 tsc（vitest / 测试引用 docs-site 源码）下也需要声明。
// 本文件必须是全局脚本（无顶层 import），ambient module 声明才生效。
declare module 'virtual:shikiform-demo-imports' {
  export const names: readonly string[]
  export function loadImport(name: string): Promise<Record<string, unknown>>
}
declare module 'virtual:shikiform-tutorials' {
  const files: Record<string, { starter: string; solution: string }>
  export default files
}
declare module 'virtual:shikiform-demo-components' {
  const components: Record<string, (props: Record<string, unknown>) => unknown>
  export default components
}
