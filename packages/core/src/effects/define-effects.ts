import { isPatchable } from '../draft/patch'
import { joinPath, parentPath } from '../shared/path'
import { callSite, ShikiUsageError } from '../errors'
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
 * A selected plain object creates one reaction per own enumerable string key.
 * A selected array creates one instance per array element, and per element of every nested array of objects.
 * Arrays of primitives are not entered. Only the element whose own reads are dirty runs again.
 * `watch` runs after its source changes, not on the first pass. `watch.each` is the element-scoped watch.
 * `$rules` and `$required` written here validate even when the JSX field is unmounted.
 * Two reactions writing the same `$` state throw {@link ShikiConflictError}.
 *
 * @example
 * defineEffects<{ tab: string; code: string; rows: { name: string }[] }>(({ reaction, draft }) => {
 *   reaction((d) => {
 *     d.code.$visible = d.tab.$value === 'extra'
 *   })
 *   reaction.each(draft.rows, (row, { index, depth }) => {
 *     if (depth !== 0) return
 *     row.name.$required = index > 0
 *   })
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
          each(target: unknown, effect: Function) {
            installEach(runtime as EachRuntime, target, effect, dev() ? callSite() : undefined)
          },
        },
      ) as EffectsAPI<T>['reaction']

      const watch = Object.assign(
        (source: unknown, effect: (d: Draft<T>) => void) => {
          const id = runtime.nextId('watch')
          const deps = watchSourceDeps(runtime, source)
          const sourceFn = runtime.readPath(source) === undefined && typeof source === 'function'
            ? (source as (d: Draft<T>) => unknown)
            : undefined
          const run = () => {
            if (sourceFn) runtime.setDeps(id, runtime.trackOnly(() => sourceFn(runtime.draft)).deps)
            const result = runtime.runWith({ id, deps: false, writes: true }, () => effect(runtime.draft))
            runtime.applyWrites(id, result.writes)
          }
          runtime.registerWatch(id, run, deps)
        },
        {
          each(target: unknown, effect: Function) {
            installWatchEach(runtime, target, effect)
          },
        },
      ) as EffectsAPI<T>['watch']

      runtime.beginEffectInstall()
      try {
        factory({
          reaction,
          watch,
          draft: runtime.draft,
          query: (path) => runtime.handle(path),
        })
      } finally {
        runtime.endEffectInstall()
      }
    },
  }
}

const dev = () => process.env.NODE_ENV !== 'production'

/**
 * Path of a handle passed to `each`, taken once at registration.
 * `undefined` when `target` is a selector, which is re-read every pass.
 */
function fixedEachPath(runtime: EffectsRuntime<any>, target: unknown, label: string): string | undefined {
  const path = runtime.readPath(target)
  if (path !== undefined) return path
  if (typeof target === 'function') return undefined
  throw new ShikiUsageError(`${label} takes a draft handle (draft.items) or a selector ((d) => d.items) that returns one.`)
}

/**
 * Dependencies for `watch`. A handle (or a list of handles) is that path's `$value`,
 * the same keys `d.city.$value` would record. A function is scouted as before.
 */
function watchSourceDeps(runtime: EffectsRuntime<any>, source: unknown): Set<string> {
  if (Array.isArray(source)) {
    if (source.length === 0) throw new ShikiUsageError('watch([draft.a, draft.b]) needs at least one draft handle.')
    const deps = new Set<string>()
    for (const item of source) {
      const path = runtime.readPath(item)
      if (path === undefined) {
        throw new ShikiUsageError('watch([draft.a, draft.b]) takes draft handles. For any other source, pass a function: watch((d) => d.a.$value, …).')
      }
      deps.add(`${path}:value`)
    }
    return deps
  }
  const path = runtime.readPath(source)
  if (path !== undefined) return new Set([`${path}:value`])
  if (typeof source === 'function') return runtime.trackOnly(() => (source as (d: Draft<any>) => unknown)(runtime.draft)).deps
  throw new ShikiUsageError('watch takes a draft handle (watch(draft.city, …)), a list of handles (watch([draft.a, draft.b], …)), or a function (watch((d) => d.city.$value, …)).')
}

function selectEachPath(
  runtime: EffectsRuntime<any>,
  select: (d: Draft<any>) => unknown,
  error: string,
): { path: string; deps: Set<string> } {
  const selected = runtime.trackOnly(() => select(runtime.draft))
  const path = runtime.readPath(selected.value)
  if (path === undefined) throw new ShikiUsageError(error)
  return { path, deps: selected.deps }
}

function installEach(runtime: EachRuntime, target: unknown, effect: Function, site?: string): void {
  const fixed = fixedEachPath(runtime, target, 'reaction.each')
  const id = runtime.nextId('each', site)
  const rec: EachRec = { effect, path: fixed ?? '', instances: new Set(), first: true }
  runtime.holdEach(id, rec)
  const run = () => {
    const selected = fixed !== undefined
      ? { path: fixed, deps: new Set<string>() }
      : selectEachPath(runtime, target as (d: Draft<any>) => unknown, 'each() selector must return a draft handle')
    const path = selected.path
    if (rec.path !== path) dropUnseen(runtime, rec.instances, new Set())
    rec.path = path
    const value = runtime.getValue(path)
    const deps = new Set(selected.deps)
    deps.add(`${path}:structure`)
    if (Array.isArray(value)) {
      runEach(runtime, rec, id, value)
    } else {
      runObjectEach(runtime, rec, id, isPatchable(value) ? Object.keys(value) : [])
      deps.add(`${path}:keys`)
    }
    rec.first = false
    runtime.setDeps(id, deps)
  }
  runtime.registerReaction(id, run, new Set())
  runtime.queue(id)
}

function runEach(runtime: EachRuntime, rec: EachRec, id: string, value: unknown[]): void {
  const nodes = listEachNodes(value, rec.path)
  const dirty = runtime.takeEachDirty(rec.path)
  const all = rec.first || dirty.rows.get(rec.path) === 'all' || dirty.pos === 'all'
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
          // A row removal can queue this instance (via a shared dep) before its parent reconciles.
          if (!nodeExists(runtime, captured)) return
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
    if (fresh || all || nodeDirty(node, rec.path, dirty)) runtime.queue(inst)
  }
  dropUnseen(runtime, rec.instances, seen)
}

/** Object entries have a stable property name and no array position. */
function runObjectEach(runtime: EachRuntime, rec: EachRec, id: string, keys: string[]): void {
  const owner = rec.path
  const seen = new Set<string>()
  for (const key of keys) {
    const inst = `${id}@${key}`
    seen.add(inst)
    if (rec.instances.has(inst)) continue
    if (!key || key.includes('.') || key.includes('[')) {
      throw new ShikiUsageError(`reaction.each cannot address key ${JSON.stringify(key)} in ${owner || 'the root object'}. Use a nonempty field name without "." or "[".`)
    }
    const path = joinPath(owner, key)
    runtime.registerReaction(inst, () => {
      // A delete can queue this instance before its parent reconciles the keys.
      const value = runtime.getValue(owner)
      if (!isPatchable(value) || Array.isArray(value) || !Object.hasOwn(value, key)) return
      const result = runtime.runWith({ id: inst, deps: true, writes: true }, () =>
        rec.effect(runtime.handle(path), { d: runtime.draft, key, path, depth: 0 }),
      )
      runtime.setDeps(inst, result.deps)
      runtime.applyWrites(inst, result.writes)
    }, new Set())
    rec.instances.add(inst)
    runtime.queue(inst)
  }
  dropUnseen(runtime, rec.instances, seen)
}

function installWatchEach(runtime: EffectsRuntime<any>, target: unknown, effect: Function): void {
  const fixed = fixedEachPath(runtime, target, 'watch.each')
  const id = runtime.nextId('watch-each')
  const known = new Set<string>()
  let currentPath = fixed ?? ''
  const run = () => {
    const selected = fixed !== undefined
      ? { path: fixed, deps: new Set<string>() }
      : selectEachPath(runtime, target as (d: Draft<any>) => unknown, 'watch.each selector must return a draft handle')
    const arrayPath = selected.path
    if (currentPath !== arrayPath) dropUnseen(runtime, known, new Set())
    currentPath = arrayPath
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
        runtime.registerWatch(
          inst,
          () => {
            if (!nodeExists(runtime, captured)) return
            const result = runtime.runWith({ id: inst, deps: true, writes: true, pos: captured.pos, nodePath: captured.path }, () =>
              effect(runtime.handle(captured.path), rowContext(runtime, captured)),
            )
            runtime.setDeps(inst, result.deps)
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

function nodeExists(runtime: EffectsRuntime<any>, node: EachNode): boolean {
  const owner = runtime.getValue(parentPath(node.path) ?? '')
  return Array.isArray(owner) && node.index < owner.length
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return isPatchable(value) && !Array.isArray(value)
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
