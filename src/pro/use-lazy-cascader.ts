import { useCallback, useEffect, useRef, useState } from 'react'

/** A cascader node. `isLeaf: false` without `children` means "load on expand". */
export interface CascaderOption {
  label: string
  value: string | number
  isLeaf?: boolean
  disabled?: boolean
  children?: CascaderOption[]
  /** Set while this node's children load. */
  loading?: boolean
}

/** Load the children of `path` (the selected values so far; `[]` is the root). */
export type CascaderLoader = (path: Array<string | number>) => Promise<readonly CascaderOption[]> | readonly CascaderOption[]

export interface UseLazyCascaderOptions {
  load: CascaderLoader
  /** `load([])` returns the whole tree; never load lazily. */
  all?: boolean
  /** Value paths to show on open (反显). Each path's ancestors are loaded so the labels resolve. */
  paths?: ReadonlyArray<ReadonlyArray<string | number>>
  /** Default true. `false` loads nothing (a read view whose value already carries its labels). */
  enabled?: boolean
}

export interface LazyCascaderApi {
  options: CascaderOption[]
  /** True while the root or an echo path loads. */
  loading: boolean
  /** Load the children of `path` unless they are loaded or the node is a leaf. */
  loadChildren: (path: Array<string | number>) => Promise<void>
  /** Load what is missing for each path (反显). */
  ensure: (paths: ReadonlyArray<ReadonlyArray<string | number>>) => Promise<void>
  /** Labels along a value path, as far as the tree is loaded. */
  labelsOf: (path: ReadonlyArray<string | number>) => string[]
}

/**
 * Headless lazy cascader (Pro.formily `CascaderPlus`): root on mount, children on demand, a loader shared by
 * every level, and echo of an existing value by loading each ancestor level. `CascaderPlus` in
 * `shikiform/antd` renders it with Ant Design's Cascader and adds `multiple` / `labelInValue`.
 */
export function useLazyCascader(options: UseLazyCascaderOptions): LazyCascaderApi {
  const loadRef = useRef(options.load)
  loadRef.current = options.load
  const tree = useRef<CascaderOption[]>([])
  const pending = useRef(new Map<string, Promise<void>>())
  const [version, setVersion] = useState(0)
  const [loading, setLoading] = useState(false)
  const bump = () => setVersion((v) => v + 1)

  const loadChildren = useCallback(async (path: Array<string | number>) => {
    if (options.all) return
    const node = find(tree.current, path)
    if (!node || node.isLeaf || node.children) return
    const id = JSON.stringify(path)
    const existing = pending.current.get(id)
    if (existing) return existing
    node.loading = true
    bump()
    const task = Promise.resolve(loadRef.current(path))
      .then((children) => {
        node.children = children.map((child) => ({ ...child }))
        if (!children.length) node.isLeaf = true
      })
      .finally(() => {
        node.loading = false
        pending.current.delete(id)
        tree.current = [...tree.current]
        bump()
      })
    pending.current.set(id, task)
    return task
  }, [options.all])

  const rootReady = useRef<Promise<void> | null>(null)
  const ensure = useCallback(
    async (paths: ReadonlyArray<ReadonlyArray<string | number>>) => {
      if (rootReady.current) await rootReady.current
      if (options.all) return
      await Promise.all(
        paths.map(async (path) => {
          for (let depth = 1; depth < path.length; depth++) await loadChildren(path.slice(0, depth))
        }),
      )
    },
    [loadChildren, options.all],
  )

  const pathsRef = useRef(options.paths)
  pathsRef.current = options.paths
  const enabled = options.enabled !== false
  useEffect(() => {
    if (!enabled) return
    let live = true
    setLoading(true)
    rootReady.current = Promise.resolve(loadRef.current([])).then((root) => {
      if (!live) return
      tree.current = root.map((node) => clone(node))
      bump()
    })
    rootReady.current
      .then(() => (live && pathsRef.current?.length ? ensure(pathsRef.current) : undefined))
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [options.all, enabled])

  void version
  return {
    options: tree.current,
    loading,
    loadChildren,
    ensure,
    labelsOf: (path) => {
      const labels: string[] = []
      let level: CascaderOption[] | undefined = tree.current
      for (const value of path) {
        const node: CascaderOption | undefined = level?.find((item) => item.value == value)
        if (!node) break
        labels.push(node.label)
        level = node.children
      }
      return labels
    },
  }
}

function find(tree: CascaderOption[], path: ReadonlyArray<string | number>): CascaderOption | undefined {
  let level: CascaderOption[] | undefined = tree
  let node: CascaderOption | undefined
  for (const value of path) {
    node = level?.find((item) => item.value == value)
    if (!node) return undefined
    level = node.children
  }
  return node
}

function clone(node: CascaderOption): CascaderOption {
  return { ...node, children: node.children?.map(clone) }
}

type Key = string | number

/**
 * The value paths a cascader field holds: one path, or (`multiple`) several. A `labelInValue` level
 * (`{ label, value }`) contributes its `value`.
 */
export function cascaderPaths(value: unknown, multiple?: boolean): Key[][] {
  if (!Array.isArray(value) || !value.length) return []
  const unwrap = (path: unknown[]): Key[] => path.map((item) => (item && typeof item === 'object' ? (item as { value: Key }).value : (item as Key)))
  return multiple ? (value as unknown[]).filter(Array.isArray).map((path) => unwrap(path as unknown[])) : [unwrap(value)]
}

export interface UseCascaderLabelsOptions {
  value: unknown
  multiple?: boolean
  /** The same loader the editable cascader uses. Without it, levels without a label show their value. */
  load?: CascaderLoader
  all?: boolean
}

export interface CascaderLabelsApi {
  /** One label list per path. A level shows its `labelInValue` label, else the loaded label, else its value. */
  labels: string[][]
  /** True while the tree loads the ancestors needed to resolve a bare value. */
  loading: boolean
}

/**
 * Labels for a cascader value, for a read view (`readPretty`). A `labelInValue` value already carries its labels and
 * loads nothing. A bare value (`['zj', 'hz']`) is resolved by loading each ancestor level through `load`, the same way
 * {@link useLazyCascader} echoes a value into the editor.
 */
export function useCascaderLabels(options: UseCascaderLabelsOptions): CascaderLabelsApi {
  const list: unknown[][] = !Array.isArray(options.value) || !options.value.length
    ? []
    : options.multiple
      ? (options.value as unknown[]).filter(Array.isArray) as unknown[][]
      : [options.value as unknown[]]
  const labeled = (item: unknown) => !!item && typeof item === 'object' && typeof (item as { label?: unknown }).label === 'string'
  const needsTree = !!options.load && list.some((path) => path.some((item) => !labeled(item)))
  const paths = cascaderPaths(options.value, options.multiple)
  const tree = useLazyCascader({ load: options.load ?? (() => []), all: options.all, paths, enabled: needsTree })
  const key = JSON.stringify(paths)
  const seen = useRef(key)
  useEffect(() => {
    if (!needsTree || key === seen.current) return
    seen.current = key
    void tree.ensure(paths)
  })
  const labels = list.map((path, index) => {
    const loaded = needsTree ? tree.labelsOf(paths[index]!) : []
    return path.map((item, depth) => {
      if (labeled(item)) return (item as { label: string }).label
      return loaded[depth] ?? String(item && typeof item === 'object' ? (item as { value: unknown }).value : item)
    })
  })
  return { labels, loading: needsTree && tree.loading }
}
