import { useMemo, type ComponentType } from 'react'
import { Playground } from './playground/Playground'

/** Props the MDX compiler (site/mdx) passes for a `tsx preview` / `tsx live` fence. */
export interface DemoProps {
  code: string
  language: string
  mode: 'preview' | 'live'
  id: string
  /** Build-time module of the same fence (`preview` only). */
  component?: ComponentType
  /** The fence highlighted by VitePress' own Markdown renderer. */
  html?: string
  /** `play=<route>` in the fence meta: a full /play scenario for this example. */
  play?: string
}

/** Preview renders the build-time module of the fence it shows; live compiles that same source in the browser. */
export function Demo({ code, language, mode, id, component, html, play }: DemoProps) {
  if (mode === 'preview' && !component) throw new Error(`Missing compiled preview: ${id}`)
  const files = useMemo(() => ({ [`App.${language}`]: code }), [code, language])
  // A source revision starts over; a theme change re-renders in place and keeps form state.
  return <Playground key={`${id}:${code}`} files={files} language={language} component={component} codeHtml={html}
    editing={mode === 'live'} play={play} />
}
