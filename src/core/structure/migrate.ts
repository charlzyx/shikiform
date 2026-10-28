import type { FieldModel } from '../state/field-model'

/**
 * Move field models with their row / node identity.
 * `oldIds` / `newIds` map a row id to its path before and after the change.
 * A model under a row that disappeared is dropped; one under a moved row is re-keyed to the new path.
 * The deepest owning row wins, so nested rows migrate independently.
 */
export function reindexById(fields: Map<string, FieldModel>, oldIds: Map<string, string>, newIds: Map<string, string>): void {
  const owned: string[] = []
  const moves: { to: string; model: FieldModel }[] = []
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
    if (!target) continue
    moves.push({ to: target + fieldPath.slice(best.length), model })
  }
  for (const path of owned) fields.delete(path)
  for (const move of moves) {
    move.model.path = move.to
    fields.set(move.to, move.model)
  }
}
