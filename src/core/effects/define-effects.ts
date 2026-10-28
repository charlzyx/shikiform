import { createUiHandle } from '../draft/handle'
import type { DraftHost } from '../draft/host'
import { listPositions, posKey } from '../structure/tree-ops'
import type { Draft, EffectDef, EffectsAPI, EffectsRuntime } from '../types'
import type { EachRec } from './scheduler'

/** What `reaction.each` / `reaction.walk` / `watch.each` need beyond the public runtime. */
interface EachRuntime extends EffectsRuntime<any> {
  holdEach(id: string, rec: EachRec): void
  takeDirtyRows(path: string): Set<number> | 'all' | undefined
  takeDirtyPos(path: string): Set<string> | 'all' | undefined
  treeConfig(path: string): { childrenKey: string; rowKey: string }
}

/**
 * Build an effect module. The factory runs once per form, against that form's draft.
 *
 * `reaction` derives `$` state. Reads are dependencies. Writes are not.
 * A flush re-runs a reaction only when a dirty key intersects those reads. Writes wake downstream reactions in that same flush.
 * `reaction.each` is one instance per array row. `reaction.walk` is one instance per tree node (`pos`).
 * Only the row or node whose own reads are dirty runs again.
 * `watch` runs after its source changes, not on the first pass. `watch.each` is the row-scoped watch.
 * `$rules` and `$required` written here validate even when the JSX field is unmounted.
 * Two reactions writing the same `$` state throw {@link ShikiConflictError}.
 *
 * @example
 * defineEffects<{ tab: string; code: string; rows: { name: string }[] }>(({ reaction }) => {
 *   reaction((d) => {
 *     d.code.$display = d.tab.$value === 'extra' ? 'visible' : 'hidden'
 *   })
 *   reaction.each(
 *     (d) => d.rows,
 *     (row) => {
 *       row.name.$required = true
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
          const id = runtime.nextId('reaction')
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
            installEach(runtime as EachRuntime, 'each', select as (d: Draft<any>) => unknown, effect)
          },
          walk(select: (d: Draft<T>) => unknown, effect: Function, opts?: { childrenKey?: string }) {
            installEach(runtime as EachRuntime, 'walk', select as (d: Draft<any>) => unknown, effect, opts?.childrenKey ?? 'children')
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
        query: (path, opts) => (opts?.ui ? createUiHandle(runtime as unknown as DraftHost, path, opts.ui) : runtime.handle(path)),
      })
    },
  }
}

function installEach(
  runtime: EachRuntime,
  kind: 'each' | 'walk',
  select: (d: Draft<any>) => unknown,
  effect: Function,
  childrenKey = 'children',
): void {
  const id = runtime.nextId(kind)
  const rec: EachRec = { kind, select, effect, arrayPath: '', childrenKey, instances: new Set(), first: true }
  runtime.holdEach(id, rec)
  const run = () => {
    const selected = runtime.trackOnly(() => select(runtime.draft))
    const arrayPath = runtime.readPath(selected.value)
    if (!arrayPath) throw new Error(`${kind}() selector must return a draft handle`)
    rec.arrayPath = arrayPath
    if (kind === 'walk') runtime.noteTree(arrayPath, childrenKey)
    if (kind === 'each') runArrayEach(runtime, rec, id)
    else runWalk(runtime, rec, id)
    rec.first = false
    const deps = new Set(selected.deps)
    deps.add(`${arrayPath}:structure`)
    runtime.setDeps(id, deps)
  }
  runtime.registerReaction(id, run, new Set())
  runtime.queue(id)
}

function runArrayEach(runtime: EachRuntime, rec: EachRec, id: string): void {
  const arr = (runtime.getValue(rec.arrayPath) as unknown[]) ?? []
  const dirty = rec.first ? 'all' : runtime.takeDirtyRows(rec.arrayPath)
  const seen = new Set<string>()
  for (let index = 0; index < arr.length; index++) {
    const inst = `${id}#${index}`
    seen.add(inst)
    const fresh = !rec.instances.has(inst)
    if (fresh) {
      const captured = index
      runtime.registerReaction(
        inst,
        () => {
          const result = runtime.runWith({ id: inst, deps: true, writes: true }, () =>
            rec.effect(runtime.handle(`${rec.arrayPath}.${captured}`), runtime.draft, captured),
          )
          runtime.setDeps(inst, result.deps)
          runtime.applyWrites(inst, result.writes)
        },
        new Set(),
      )
      rec.instances.add(inst)
    }
    const should = dirty === 'all' || (dirty instanceof Set && dirty.has(index))
    if (fresh || should) runtime.queue(inst)
  }
  dropUnseen(runtime, rec.instances, seen)
}

function runWalk(runtime: EachRuntime, rec: EachRec, id: string): void {
  const cfg = runtime.treeConfig(rec.arrayPath)
  const nodes = listPositions(runtime.getValue(rec.arrayPath), rec.arrayPath, rec.childrenKey || cfg.childrenKey, cfg.rowKey)
  const dirty = rec.first ? 'all' : runtime.takeDirtyPos(rec.arrayPath)
  const seen = new Set<string>()
  for (const node of nodes) {
    const key = posKey(node.pos)
    const inst = `${id}@${key}`
    seen.add(inst)
    const fresh = !rec.instances.has(inst)
    if (fresh) {
      const captured = node
      runtime.registerReaction(
        inst,
        () => {
          const result = runtime.runWith(
            { id: inst, deps: true, writes: true, pos: captured.pos, nodePath: captured.path },
            () => rec.effect(runtime.handle(captured.path), runtime.draft, captured.pos),
          )
          runtime.setDeps(inst, result.deps)
          runtime.applyWrites(inst, result.writes)
        },
        new Set(),
      )
      rec.instances.add(inst)
    }
    const should = dirty === 'all' || (dirty instanceof Set && dirty.has(key))
    if (fresh || should) runtime.queue(inst)
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
    const arr = (runtime.getValue(arrayPath) as unknown[]) ?? []
    const seen = new Set<string>()
    for (let index = 0; index < arr.length; index++) {
      const inst = `${id}#${index}`
      seen.add(inst)
      if (!known.has(inst)) {
        const scout = runtime.runWith({ id: inst, deps: true, writes: false }, () =>
          effect(runtime.handle(`${arrayPath}.${index}`), runtime.draft, index),
        )
        runtime.setDeps(inst, scout.deps)
        runtime.registerWatch(inst, () => {
          const result = runtime.runWith({ id: inst, deps: false, writes: true }, () =>
            effect(runtime.handle(`${arrayPath}.${index}`), runtime.draft, index),
          )
          runtime.applyWrites(inst, result.writes)
        }, scout.deps)
        known.add(inst)
      }
    }
    dropUnseen(runtime, known, seen)
    runtime.setDeps(id, new Set([`${arrayPath}:structure`, ...selected.deps]))
  }
  runtime.registerReaction(id, run, new Set())
  runtime.queue(id)
}

function dropUnseen(runtime: EffectsRuntime<any>, instances: Set<string>, seen: Set<string>): void {
  for (const inst of instances) {
    if (!seen.has(inst)) {
      runtime.dropDeps(inst)
      instances.delete(inst)
    }
  }
}
