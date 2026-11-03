/**
 * Demo — ```` ```tsx preview|live ```` 围栏渲染成的 React island（client:only="react"）。
 *
 * preview：组件从 virtual:shikiform-demo-components 取（build 时编译的同份围栏），
 * 服务端通过 shikiformDemoComponents() 用同一映射做 SSR 直出；
 * live：浏览器内 Sucrase 编译（教程练习）。代码与预编译组件来自同一份围栏。
 */
import { useMemo } from 'react'
import demoComponents from 'virtual:shikiform-demo-components'
import { Playground } from '../bridge/playground/Playground'
import { SiteThemeProvider } from '../bridge/theme'

export interface DemoProps {
  code: string
  language: string
  mode: 'preview' | 'live'
  id: string
  /** fence meta 里的 play=<route>：跳到 /play 完整场景。 */
  play?: string
}

export default function Demo({ code, language, mode, id, play }: DemoProps) {
  const component = demoComponents[id]
  if (mode === 'preview' && !component) throw new Error(`Missing compiled preview: ${id}`)
  const files = useMemo(() => ({ [`App.${language}`]: code }), [code, language])
  // 源码变更即重开；主题切换原地重渲染、保留表单状态。
  return (
    <SiteThemeProvider>
      <Playground key={`${id}:${code}`} files={files} language={language} component={component} editing={mode === 'live'} play={play} />    </SiteThemeProvider>
  )
}
