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
  useEffect(() => {
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
  }, [options.all])

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
