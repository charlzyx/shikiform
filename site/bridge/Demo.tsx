import { type ComponentType } from 'react'
import { LiveDemoLazy } from '@live-demo/rspress/web/lazy'
import '@live-demo/rspress/web/index.css'
import { useSiteDark } from './theme'

export interface DemoProps {
  code: string
  language: string
  mode: 'preview' | 'live'
  id: string
  component?: ComponentType
}

/** Preview executes the same build-time module shown below; live edits trusted local examples. */
export function Demo({ code, language, mode, id, component: Component }: DemoProps) {
  const isDark = useSiteDark()
  if (mode === 'preview') {
    if (!Component) throw new Error(`Missing compiled preview: ${id}`)
    return <section className="shiki-demo" aria-label="可运行示例">
      <div className="shiki-demo-preview"><Component /></div>
      <details><summary>查看完整源码</summary><pre><code className={`language-${language}`}>{code}</code></pre></details>
    </section>
  }
  const pluginProps = {
    files: JSON.stringify({ 'App.tsx': code }),
    entryFileName: JSON.stringify('App.tsx'),
    externalImports: JSON.stringify(['react', 'shikiform', 'shikiform/core', 'shikiform/pro', 'shikiform/antd', 'antd', 'zod']),
    options: JSON.stringify({ fileTabs: { hideSingleTab: true } }),
  }
  // Source revision changes reset the editor; theme-only changes must not reset form state.
  return <LiveDemoLazy key={`${id}:${code}`} isDark={isDark} pluginProps={pluginProps} />
}
