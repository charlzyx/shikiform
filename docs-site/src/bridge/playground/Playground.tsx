import {
  Component,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react'
import { ConfigProvider, theme as antdTheme, type ThemeConfig } from 'antd'
import type { EditorView } from '@codemirror/view'
import { useSiteDark } from '../theme'
import type { DemoFiles } from './runtime'
import {
  CheckIcon, ChevronIcon, CollapseIcon, CopyIcon, EditIcon, ExpandIcon, ExternalIcon, RerunIcon, ResetIcon,
} from './icons'

export interface PlaygroundProps {
  /** File name → source. Several files show as tabs and import each other relatively (`./fields`). */
  files: DemoFiles
  /** The file whose default export is rendered. Defaults to the first file. */
  entry?: string
  /** Language label in the toolbar. */
  language?: string
  /** The entry compiled at build time: rendered on the server and until the code is edited. */
  component?: ComponentType
  /** The entry highlighted by VitePress (same markup as a Markdown code block). */
  codeHtml?: string
  /** Start with the editor open. */
  editing?: boolean
  /** A `/play/<route>` scenario that expands this example. */
  play?: string
  /** Accessible name of the example. */
  label?: string
  /** Extra toolbar buttons (a tutorial's "show answer"). */
  actions?: ReactNode
  /** Short state text next to the language label. */
  status?: ReactNode
  /** Called by the reset button after the code is restored. */
  onReset?: () => void
}

/** Time to wait after the latest keystroke before recompiling. */
const EDIT_DELAY = 300

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

function sameFiles(a: DemoFiles, b: DemoFiles) {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key])
}

/** Antd follows the Nimbus appearance (data-mode). A theme change re-renders the preview; it never remounts it. */
function DemoTheme({ children }: { children: ReactNode }) {
  const dark = useSiteDark()
  const config = useMemo<ThemeConfig>(() => ({
    algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    // Nimbus 的品牌色和正文字体。
    token: { colorPrimary: dark ? '#5c73e7' : '#3451b2', fontFamily: 'var(--nb-font-sans, system-ui)' },
  }), [dark])
  return <ConfigProvider theme={config}>{children}</ConfigProvider>
}

/** Runtime errors of an edited demo stay inside its preview. */
class PreviewBoundary extends Component<{ children: ReactNode }, { error?: unknown }> {
  state: { error?: unknown } = {}
  static getDerivedStateFromError(error: unknown) {
    return { error }
  }
  render() {
    if (this.state.error === undefined) return this.props.children
    return <pre className="sf-demo__error" role="alert">{errorText(this.state.error)}</pre>
  }
}

/** Compile edited sources (debounced). Keeps the last good component while the current edit fails. */
function useCompiled(sources: DemoFiles, entry: string, enabled: boolean) {
  const [state, setState] = useState<{ component?: ComponentType; error?: string; version: number }>({ version: 0 })
  const compiledOnce = useRef(false)
  useEffect(() => {
    if (!enabled) return
    let stale = false
    const timer = setTimeout(() => {
      import('./runtime')
        .then(({ compileDemo }) => compileDemo(sources, entry))
        .then(
          (component) => {
            if (stale) return
            compiledOnce.current = true
            setState((previous) => ({ component, version: previous.version + 1 }))
          },
          (error: unknown) => {
            if (!stale) setState((previous) => ({ ...previous, error: errorText(error) }))
          },
        )
    }, compiledOnce.current ? EDIT_DELAY : 0)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [sources, entry, enabled])
  return state
}

/** CodeMirror is loaded on demand; until then the same source shows as static code (no layout jump). */
function CodeEditor({ doc, label, fallback, onChange }: {
  doc: string
  label: string
  fallback: ReactNode
  onChange: (doc: string) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const latest = useRef(onChange)
  latest.current = onChange
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let view: EditorView | undefined
    let cancelled = false
    void import('./editor').then(({ mountEditor }) => {
      if (cancelled || !host.current) return
      view = mountEditor({ parent: host.current, doc, label, onChange: (next) => latest.current(next) })
      setReady(true)
    })
    return () => {
      cancelled = true
      view?.destroy()
    }
    // `doc` seeds the view; later edits live in CodeMirror. The parent remounts this per file and per reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="sf-demo__editor">
      {/* CodeMirror owns this node's children; React never renders into it. */}
      <div ref={host} />
      {!ready && fallback}
    </div>
  )
}

function ToolButton({ label, pressed, onClick, children }: {
  label: string
  pressed?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button type="button" className="sf-demo__btn" aria-label={label} title={label} aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  )
}

/**
 * A documentation example in the VitePress idiom: the running preview, a toolbar, and the source below it as a
 * collapsible code block that turns into an editor. Theme changes keep form state; only a source change (edit,
 * reset) or "re-run" remounts the preview.
 */
export function Playground({
  files, entry: entryProp, language = 'tsx', component, codeHtml, editing: editingProp = false, play,
  label = '可运行示例', actions, status, onReset,
}: PlaygroundProps) {
  const names = Object.keys(files)
  const entry = entryProp ?? names[0]
  const codeId = useId()
  const root = useRef<HTMLElement>(null)

  const [sources, setSources] = useState(files)
  const [active, setActive] = useState(entry)
  const [open, setOpen] = useState(editingProp)
  const [editing, setEditing] = useState(editingProp)
  const [revision, setRevision] = useState(0) // remounts editors on reset
  const [run, setRun] = useState(0) // remounts the preview
  const [copied, setCopied] = useState(false)
  const [fullscreen, setFullscreen] = useState<boolean | null>(null) // null: unsupported, or not mounted yet

  const pristine = sameFiles(sources, files)
  const prebuilt = pristine && component !== undefined
  const compiled = useCompiled(sources, entry, !prebuilt)
  const Preview = prebuilt ? component : compiled.component

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  useEffect(() => {
    if (!document.fullscreenEnabled) return
    const sync = () => setFullscreen(document.fullscreenElement === root.current)
    sync()
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  const copy = () => {
    void navigator.clipboard?.writeText(sources[active] ?? '').then(() => setCopied(true))
  }
  const reset = () => {
    setSources(files)
    setRevision((value) => value + 1)
    setRun((value) => value + 1)
    onReset?.()
  }
  const toggleEditing = () => {
    setEditing(!editing)
    setOpen(true)
  }
  const toggleFullscreen = () => {
    if (fullscreen) void document.exitFullscreen()
    else void root.current?.requestFullscreen()
  }

  const staticCode = (file: string) =>
    pristine && file === entry && codeHtml
      ? <div className="sf-demo__highlighted" dangerouslySetInnerHTML={{ __html: codeHtml }} />
      : <pre className="sf-demo__pre"><code>{sources[file]}</code></pre>

  return (
    <section ref={root} className="sf-demo" aria-label={label} data-editing={editing || undefined}>
      <div className="sf-demo__preview vp-raw" data-prebuilt={prebuilt || undefined}>
        <DemoTheme>
          {Preview
            ? <PreviewBoundary key={`${prebuilt ? 'built' : compiled.version}:${run}`}><Preview /></PreviewBoundary>
            : !compiled.error && <p className="sf-demo__loading">正在加载示例…</p>}
        </DemoTheme>
        {!prebuilt && compiled.error && <pre className="sf-demo__error" role="alert">{compiled.error}</pre>}
      </div>

      <div className="sf-demo__bar" role="toolbar" aria-label="示例工具栏">
        <button type="button" className="sf-demo__toggle" aria-expanded={open} aria-controls={codeId} onClick={() => setOpen(!open)}>
          <ChevronIcon />
          <span>{open ? '收起代码' : '查看代码'}</span>
        </button>
        <span className="sf-demo__lang">{language}</span>
        {status && <span className="sf-demo__status">{status}</span>}
        {!pristine && <span className="sf-demo__status">已修改</span>}
        <span className="sf-demo__actions">
          {actions}
          <ToolButton label={editing ? '只读查看代码' : '编辑代码'} pressed={editing} onClick={toggleEditing}><EditIcon /></ToolButton>
          <ToolButton label={copied ? '已复制' : '复制代码'} onClick={copy}>{copied ? <CheckIcon /> : <CopyIcon />}</ToolButton>
          <ToolButton label="重新运行" onClick={() => setRun(run + 1)}><RerunIcon /></ToolButton>
          {(!pristine || onReset) && <ToolButton label="重置" onClick={reset}><ResetIcon /></ToolButton>}
          {play && (
            <a className="sf-demo__btn" href={`/play/${play}`} target="_blank" rel="noreferrer"
              aria-label="在 Play 中打开完整示例" title="在 Play 中打开完整示例">
              <ExternalIcon />
            </a>
          )}
          {fullscreen !== null && (
            <ToolButton label={fullscreen ? '退出全屏' : '全屏'} onClick={toggleFullscreen}>
              {fullscreen ? <CollapseIcon /> : <ExpandIcon />}
            </ToolButton>
          )}
        </span>
        <span className="sf-demo__sr" aria-live="polite">{copied ? '代码已复制' : ''}</span>
      </div>

      {open && (
        <div id={codeId} className="sf-demo__code">
          {names.length > 1 && (
            <div className="sf-demo__tabs" role="tablist" aria-label="示例文件">
              {names.map((name) => (
                <button key={name} type="button" role="tab" className="sf-demo__tab" aria-selected={name === active}
                  onClick={() => setActive(name)}>
                  {name}
                </button>
              ))}
            </div>
          )}
          {editing
            ? <CodeEditor key={`${active}:${revision}`} doc={sources[active] ?? ''} label={`编辑 ${active}`}
                fallback={staticCode(active)} onChange={(doc) => setSources((current) => ({ ...current, [active]: doc }))} />
            : staticCode(active)}
        </div>
      )}
    </section>
  )
}
