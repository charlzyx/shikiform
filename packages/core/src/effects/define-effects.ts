import { callSite } from '../errors'
import type { Draft, EffectDef, EffectsAPI, EffectsRuntime, RowContext } from '../types'
import type { EachDirty, EachRec } from './scheduler'

/** What `reaction.each` / `watch.each` need beyond the public runtime. */
interface EachRuntime extends EffectsRuntime<any> {
  holdEach(id: string, rec: EachRec): void
  takeEachDirty(root: string): EachDirty
}

/** One element `each` visits. `rel` is the path under the selected array (`0`, `0.children.1`). */
interface EachNode {
  path: string
  rel: string
  key: string
  index: number
  depth: number
  pos: number[]
  parentPath?: string
}

/**
 * Build an effect module. The factory runs once per form, against that form's draft.
 *
 * `reaction` derives `$` state. Reads are dependencies. Writes are not.
 * A flush re-runs a reaction only when a dirty key intersects those reads. Writes wake downstream reactions in that same flush.
 * `reaction.each` is one instance per array element, and per element of every nested array of objects.
 * Arrays of primitives are not entered. Only the element whose own reads are dirty runs again.
 * `watch` runs after its source changes, not on the first pass. `watch.each` is the element-scoped watch.
 * `$rules` and `$required` written here validate even when the JSX field is unmounted.
 * Two reactions writing the same `$` state throw {@link ShikiConflictError}.
 *
 * @example
 * defineEffects<{ tab: string; code: string; rows: { name: string }[] }>(({ reaction }) => {
 *   reaction((d) => {
 *     d.code.$visible = d.tab.$value === 'extra'
 *   })
 *   reaction.each(
 *     (d) => d.rows,
 *     (row, { index, depth }) => {
 *       if (depth !== 0) return
 *       row.name.$required = index > 0
 *     },
 *   )
 * })
 */
export function defineEffects<T>(factory: (api: EffectsAPI<T>) => void): EffectDef<T> {
  return {
    install(form) {
      const runtime = form as EffectsRuntime<T>
      const reaction = Object.assign(
        (effect: (d: Draft<T>) => void) => {
          const id = runtime.nextId('reaction', dev() ? callSite() : undefined)
          const run = () => {
            const result = runtime.runWith({ id, deps: true, writes: true }, () => effect(runtime.draft))
            runtime.setDeps(id, result.deps)
            runtime.applyWrites(id, result.writes)
          }
          runtime.registerReaction(id, run, new Set())
          runtime.queue(id)
        },
        {
          each(select: (d: Draft<T>) => unknown, effect: Function) {
            installEach(runtime as EachRuntime, select as (d: Draft<any>) => unknown, effect, dev() ? callSite() : undefined)
          },
        },
      ) as EffectsAPI<T>['reaction']

      const watch = Object.assign(
        (source: (d: Draft<T>) => unknown, effect: (d: Draft<T>) => void) => {
          const id = runtime.nextId('watch')
          const scout = runtime.trackOnly(() => source(runtime.draft))
          const run = () => {
            const result = runtime.runWith({ id, deps: false, writes: true }, () => effect(runtime.draft))
            runtime.applyWrites(id, result.writes)
          }
          runtime.registerWatch(id, run, scout.deps)
        },
        {
          each(select: (d: Draft<T>) => unknown, effect: Function) {
            installWatchEach(runtime, select as (d: Draft<any>) => unknown, effect)
          },
        },
      ) as EffectsAPI<T>['watch']

      factory({
        reaction,
        watch,
        query: (path) => runtime.handle(path),
      })
    },
  }
}

const dev = () => process.env.NODE_ENV !== 'production'

function installEach(runtime: EachRuntime, select: (d: Draft<any>) => unknown, effect: Function, site?: string): void {
  const id = runtime.nextId('each', site)
  const rec: EachRec = { select, effect, arrayPath: '', instances: new Set(), first: true }
  runtime.holdEach(id, rec)
  const run = () => {
    const selected = runtime.trackOnly(() => select(runtime.draft))
    const arrayPath = runtime.readPath(selected.value)
    if (!arrayPath) throw new Error('each() selector must return a draft handle')
    rec.arrayPath = arrayPath
    runEach(runtime, rec, id)
    rec.first = false
    const deps = new Set(selected.deps)
    deps.add(`${arrayPath}:structure`)
    runtime.setDeps(id, deps)
  }
  runtime.registerReaction(id, run, new Set())
  runtime.queue(id)
}

function runEach(runtime: EachRuntime, rec: EachRec, id: string): void {
  const nodes = listEachNodes(runtime.getValue(rec.arrayPath), rec.arrayPath)
  const dirty = runtime.takeEachDirty(rec.arrayPath)
  const all = rec.first || dirty.rows.get(rec.arrayPath) === 'all' || dirty.pos === 'all'
  const seen = new Set<string>()
  for (const node of nodes) {
    const inst = `${id}#${node.rel}`
    seen.add(inst)
    const fresh = !rec.instances.has(inst)
    if (fresh) {
      const captured = node
      runtime.registerReaction(
        inst,
        () => {
          const result = runtime.runWith({ id: inst, deps: true, writes: true, pos: captured.pos, nodePath: captured.path }, () =>
            rec.effect(runtime.handle(captured.path), rowContext(runtime, captured)),
          )
          runtime.setDeps(inst, result.deps)
          runtime.applyWrites(inst, result.writes)
        },
        new Set(),
      )
      rec.instances.add(inst)
    }
    if (fresh || all || nodeDirty(node, rec.arrayPath, dirty)) runtime.queue(inst)
  }
  dropUnseen(runtime, rec.instances, seen)
}

function installWatchEach(runtime: EffectsRuntime<any>, select: (d: Draft<any>) => unknown, effect: Function): void {
  const id = runtime.nextId('watch-each')
  const known = new Set<string>()
  const run = () => {
    const selected = runtime.trackOnly(() => select(runtime.draft))
    const arrayPath = runtime.readPath(selected.value)
    if (!arrayPath) throw new Error('watch.each selector must return a draft handle')
    const nodes = listEachNodes(runtime.getValue(arrayPath), arrayPath)
    const seen = new Set<string>()
    for (const node of nodes) {
      const inst = `${id}#${node.rel}`
      seen.add(inst)
      if (!known.has(inst)) {
        const captured = node
        const scout = runtime.runWith({ id: inst, deps: true, writes: false, pos: captured.pos, nodePath: captured.path }, () =>
          effect(runtime.handle(captured.path), rowContext(runtime, captured)),
        )
        runtime.setDeps(inst, scout.deps)
        runtime.registerWatch(
          inst,
          () => {
            const result = runtime.runWith({ id: inst, deps: false, writes: true, pos: captured.pos, nodePath: captured.path }, () =>
              effect(runtime.handle(captured.path), rowContext(runtime, captured)),
            )
            runtime.applyWrites(inst, result.writes)
          },
          scout.deps,
        )
        known.add(inst)
      }
    }
    dropUnseen(runtime, known, seen)
    runtime.setDeps(id, new Set([`${arrayPath}:structure`, ...selected.deps]))
  }
  runtime.registerReaction(id, run, new Set())
  runtime.queue(id)
}

/** The one `ctx` shape every `each` callback receives (see `RowContext`). */
function rowContext(runtime: EffectsRuntime<any>, node: EachNode): RowContext<any> {
  return {
    d: runtime.draft,
    key: node.key,
    index: node.index,
    depth: node.depth,
    parent: node.parentPath ? runtime.handle(node.parentPath) : undefined,
    path: node.path,
    pos: node.pos,
  }
}

function dropUnseen(runtime: EffectsRuntime<any>, instances: Set<string>, seen: Set<string>): void {
  for (const inst of instances) {
    if (!seen.has(inst)) {
      runtime.dropDeps(inst)
      instances.delete(inst)
    }
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

/** An array that contains at least one object element. Primitive arrays (and empty ones) are not entered. */
function isObjectArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false
  for (let i = 0; i < value.length; i++) if (isPlainRecord(value[i])) return true
  return false
}

/**
 * Elements of `arrayPath`, then every nested array of objects, depth-first.
 * The selected array is always entered, even when its elements are primitives.
 */
function listEachNodes(value: unknown, arrayPath: string): EachNode[] {
  const out: EachNode[] = []
  if (!Array.isArray(value)) return out
  const rootKey = arrayPath ? arrayPath.slice(arrayPath.lastIndexOf('.') + 1) : ''
  const visit = (arr: unknown[], base: string, depth: number, key: string, posPrefix: number[], parentPath?: string) => {
    for (let index = 0; index < arr.length; index++) {
      const path = base ? `${base}.${index}` : String(index)
      const rel = arrayPath && path.startsWith(`${arrayPath}.`) ? path.slice(arrayPath.length + 1) : path
      const pos = [...posPrefix, index]
      out.push({ path, rel, key, index, depth, pos, parentPath })
      const item = arr[index]
      if (!isPlainRecord(item)) continue
      for (const childKey of Object.keys(item)) {
        const child = item[childKey]
        if (isObjectArray(child)) visit(child, `${path}.${childKey}`, depth + 1, childKey, pos, path)
      }
    }
  }
  visit(value, arrayPath, 0, rootKey, [])
  return out
}

function nodeDirty(node: EachNode, arrayPath: string, dirty: EachDirty): boolean {
  if (dirty.pos instanceof Set && dirty.pos.has(node.pos.join('.'))) return true
  let acc = arrayPath
  for (const part of node.rel.split('.')) {
    if (/^\d+$/.test(part)) {
      const at = dirty.rows.get(acc)
      if (at === 'all' || (at instanceof Set && at.has(Number(part)))) return true
    }
    acc = acc ? `${acc}.${part}` : part
  }
  return false
}
