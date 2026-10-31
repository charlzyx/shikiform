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

export function reindexById(fields: Map<string, FieldModel>, oldIds: Map<string, string>, newIds: Map<string, string>): Reindexed {
  const owned: string[] = []
  const dropped: FieldModel[] = []
  const moves: { to: string; model: FieldModel }[] = []
  const moved: Reindexed['moved'] = []
  for (const [fieldPath, model] of fields) {
    let best = ''
    let bestId = ''
    for (const [id, nodePath] of oldIds) {
      if ((fieldPath === nodePath || fieldPath.startsWith(nodePath + '.')) && nodePath.length > best.length) {
        best = nodePath
        bestId = id
      }
    }
    if (!best) continue
    owned.push(fieldPath)
    const target = newIds.get(bestId)
    if (!target) {
      dropped.push(model)
      continue
    }
    moves.push({ to: target + fieldPath.slice(best.length), model })
  }
  for (const path of owned) fields.delete(path)
  for (const move of moves) {
    if (move.model.path !== move.to) moved.push({ from: move.model.path, model: move.model })
    move.model.path = move.to
    fields.set(move.to, move.model)
  }
  return { dropped, moved }
}
