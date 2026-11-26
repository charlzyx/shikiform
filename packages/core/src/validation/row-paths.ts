import type { RowPathMap } from '../shared/row-paths'

/** Replay committed structural edits from a validation snapshot to the live form. */
export class SnapshotRows {
  private readonly maps: { version: number; forward: RowPathMap; backward: RowPathMap }[] = []

  add(version: number, forward: RowPathMap, reverse: () => RowPathMap): void {
    let backward: RowPathMap | undefined
    this.maps.push({ version, forward, backward: (path) => (backward ??= reverse())(path) })
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

  project<T extends { path: string }>(issues: readonly T[], since = 0): T[] {
    return issues.flatMap((issue) => {
      const path = this.path(issue.path, since)
      return path === undefined ? [] : [{ ...issue, path }]
    })
  }
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
