// Vite 虚拟模块的类型声明（astro check / tsc 都从这里拿）。
// 必须是全局脚本（无顶层 import），ambient module 声明才生效。

declare module 'virtual:shikiform-demo-imports' {
  /** 可编辑示例允许 import 的包名。 */
  export const names: readonly string[]
  /** 允许包的模块命名空间；不在白名单内则 reject。 */
  export function loadImport(name: string): Promise<Record<string, unknown>>
}

declare module 'virtual:shikiform-tutorials' {
  /** 教程练习 id → 起始代码和参考写法（build 时从 _files 读取）。 */
  const files: Record<string, { starter: string; solution: string }>
  export default files
}

declare module 'virtual:shikiform-demo-components' {
  /** demo id → build 时编译的 preview 组件（?shikiform-demo 虚拟模块）。 */
  const components: Record<string, import('react').ComponentType>
  export default components
}
