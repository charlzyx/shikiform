/**
 * Sätteri mdast 插件：把 ```` ```tsx preview|live ```` 围栏替换成 <Demo … /> JSX。
 *
 * Demo 是 client:load island（src/components.ts 全局注册），
 * 编译后的组件由 Demo 自己从 virtual:shikiform-demo-components 取——
 * island 的 props 只能序列化，函数传不进去；服务端 Demo 用同一份映射做 SSR 直出。
 * demo id 与 src/mdx/shikiform-vite.mjs 对齐。
 */
import { isDemoFence, demoId } from './demo-shared.mjs'

export function shikiformDemoPlugin() {
  return (ctx) => {
    if (ctx.sourceFormat !== 'mdx') return null
    let count = 0
    return {
      name: 'shikiform-demo',
      code(node, context) {
        if (!isDemoFence(node)) return
        const mode = node.meta.match(/preview|live/)[0]
        const id = demoId(context.fileURL ? decodeURIComponent(context.fileURL.pathname) : 'page', count)
        const play = node.meta.match(/\bplay=([a-z\d-]+)/)?.[1]
        const attrs = [
          `code={${JSON.stringify(node.value ?? '')}}`,
          `language=${JSON.stringify(node.lang)}`,
          `mode="${mode}"`,
          `id="${id}"`,
        ]
        if (play) attrs.push(`play="${play}"`)
        context.replaceNode(node, { raw: `<Demo ${attrs.join(' ')} />` })
        count += 1
      },
    }
  }
}
