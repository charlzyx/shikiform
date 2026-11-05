import type { FieldModel } from '../state/field-model'

/**
 * Move field models with their row / node identity.
 * `oldIds` / `newIds` map a row id to its path before and after the change.
 * A model under a row that disappeared is dropped; one under a moved row is re-keyed to the new path.
 * The deepest owning row wins, so nested rows migrate independently.
 * Returns the dropped models and the moved ones (with their old path), so exact declarations among them can stay
 * on their path: dormant while the path is empty (#8), re-applied to whatever row occupies it next.
 */
export interface Reindexed {
  dropped: FieldModel[]
  moved: { from: string; model: FieldModel }[]
}

export function reindexById(fields: Map<string, FieldModel>, oldIds: ReadonlyMap<string, string>, newIds: ReadonlyMap<string, string>): Reindexed {
  return reindexKeyed(fields, (model) => model.path, oldIds, newIds)
}

/**
 * {@link reindexById} for any map of path-carrying models whose key is derived from the path (`keyOf`): named UI
 * nodes are keyed `<path>#<name>`. A model under a removed row is dropped; under a moved row it gets the new path.
 */
export function reindexKeyed<M extends { path: string }>(
  models: Map<string, M>,
  keyOf: (model: M) => string,
  oldIds: ReadonlyMap<string, string>,
  newIds: ReadonlyMap<string, string>,
): { dropped: M[]; moved: { from: string; model: M }[] } {
  const owned: string[] = []
  const dropped: M[] = []
  const moves: { to: string; model: M }[] = []
  const moved: { from: string; model: M }[] = []
  for (const [key, model] of models) {
    const fieldPath = model.path
    let best = ''
    let bestId = ''
    for (const [id, nodePath] of oldIds) {
      if ((fieldPath === nodePath || fieldPath.startsWith(nodePath + '.')) && nodePath.length > best.length) {
        best = nodePath
        bestId = id
      }
    }
    if (!best) continue
    owned.push(key)
    const target = newIds.get(bestId)
    if (!target) {
      dropped.push(model)
      continue
    }
    moves.push({ to: target + fieldPath.slice(best.length), model })
  }
  for (const key of owned) models.delete(key)
  for (const move of moves) {
    if (move.model.path !== move.to) moved.push({ from: move.model.path, model: move.model })
    move.model.path = move.to
    models.set(keyOf(move.model), move.model)
  }
  return { dropped, moved }
}
