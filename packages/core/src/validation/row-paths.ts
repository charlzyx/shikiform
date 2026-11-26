import type { RowIds, RowPathMap } from '../shared/row-paths'

/** Replay committed structural edits from a validation snapshot to the live form. */
export class SnapshotRows {
  private readonly maps: { version: number; forward: RowPathMap; backward: RowPathMap; moved: readonly string[] }[] = []

  add(version: number, forward: RowPathMap, reverse: () => RowPathMap, moved: readonly string[]): void {
    let backward: RowPathMap | undefined
    this.maps.push({ version, forward, backward: (path) => (backward ??= reverse())(path), moved })
  }

  path(path: string, since = 0): string | undefined {
    for (const { version, forward } of this.maps) {
      if (version <= since) continue
      const next = forward(path)
      if (next === undefined) return
      path = next
    }
    return path
  }

  snapshot(): RowPathMap {
    const count = this.maps.length
    return (path) => {
      for (let i = count - 1; i >= 0; i--) {
        const previous = this.maps[i]!.backward(path)
        if (previous === undefined) return
        path = previous
      }
      return path
    }
  }

  *movedPaths(includes: (path: string) => boolean): IterableIterator<string> {
    const original = this.snapshot()
    for (const { version, moved } of this.maps) {
      for (const path of moved) {
        const current = this.path(path, version)
        if (current === undefined) continue
        const from = original(current)
        if (from !== undefined && includes(from)) yield current
      }
    }
  }

  project<T extends { path: string }>(issues: readonly T[], since = 0): T[] {
    return issues.flatMap((issue) => {
      const path = this.path(issue.path, since)
      return path === undefined ? [] : [{ ...issue, path }]
    })
  }
}

/** Destinations to revisit when checking coverage of a snapshot's moved descendants. */
export function movedRowPaths(before: RowIds, after: RowIds): string[] {
  const moved: string[] = []
  for (const [id, to] of after) {
    const from = before.get(id)
    if (from !== undefined && from !== to) moved.push(to)
  }
  return moved
}

/** Published schema paths follow row identities even when no field was mounted for a path. */
export function reindexSchemaPaths(previous: Map<string, string[]>, project: RowPathMap): Map<string, string[]> {
  const next = new Map<string, string[]>()
  for (const [path, messages] of previous) {
    const livePath = project(path)
    if (livePath !== undefined) next.set(livePath, messages)
  }
  return next
}
