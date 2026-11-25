/**
 * Versions and listeners for React (`useSyncExternalStore`) and other subscribers.
 * Writers bump versions and mark keys pending; {@link Notifier.emit} delivers them in one pass.
 */
export class Notifier {
  private pathListeners = new Map<string, Set<() => void>>()
  private structListeners = new Map<string, Set<() => void>>()
  private depListeners = new Map<string, Set<() => void>>()
  private debugListeners = new Set<() => void>()
  private metaListeners = new Set<() => void>()
  private failedListeners = new Set<(errors: readonly { path: string; messages: string[] }[]) => void>()
  private pathVersion = new Map<string, number>()
  private structVersion = new Map<string, number>()
  private depVersion = new Map<string, number>()
  private pendingPaths = new Set<string>()
  private pendingStruct = new Set<string>()
  private pendingDepNotify = new Set<string>()
  private debugVersion = 0
  private metaVersion = 0
  private pendingMeta = false

  subscribePath(path: string, listener: () => void): () => void {
    return addListener(this.pathListeners, path, listener)
  }

  subscribeStructure(path: string, listener: () => void): () => void {
    return addListener(this.structListeners, path, listener)
  }

  subscribeDep(dep: string, listener: () => void): () => void {
    return addListener(this.depListeners, dep, listener)
  }

  subscribeMeta(listener: () => void): () => void {
    this.metaListeners.add(listener)
    return () => this.metaListeners.delete(listener)
  }

  /** Listeners of a `submit()` / `validate()` call that ended with errors (see `FormEngine.subscribeValidateFailed`). */
  subscribeValidateFailed(listener: (errors: readonly { path: string; messages: string[] }[]) => void): () => void {
    this.failedListeners.add(listener)
    return () => this.failedListeners.delete(listener)
  }

  validateFailed(errors: readonly { path: string; messages: string[] }[]): void {
    if (!errors.length) return
    for (const listener of [...this.failedListeners]) {
      try {
        listener(errors)
      } catch (error) {
        console.error('[shikiform] a validate-failed listener threw', error)
      }
    }
  }

  subscribeDebug(listener: () => void): () => void {
    this.debugListeners.add(listener)
    return () => this.debugListeners.delete(listener)
  }

  /** Dep keys some listener (`useWatch`, `<Watch>`) subscribes to right now. */
  depListenerKeys(): IterableIterator<string> {
    return this.depListeners.keys()
  }

  pathListenerKeys(): IterableIterator<string> {
    return this.pathListeners.keys()
  }

  /** Paths some structure listener (array / tree component) subscribes to right now. */
  structureKeys(): string[] {
    return [...this.structListeners.keys()]
  }

  getPathVersion(path: string): number {
    return this.pathVersion.get(path) ?? 0
  }

  getStructureVersion(path: string): number {
    return this.structVersion.get(path) ?? 0
  }

  getDepVersion(dep: string): number {
    return this.depVersion.get(dep) ?? 0
  }

  getMetaVersion(): number {
    return this.metaVersion
  }

  getDebugVersion(): number {
    return this.debugVersion
  }

  bumpPath(path: string): void {
    this.pathVersion.set(path, (this.pathVersion.get(path) ?? 0) + 1)
    this.pendingPaths.add(path)
  }

  bumpStructure(path: string): void {
    this.structVersion.set(path, (this.structVersion.get(path) ?? 0) + 1)
    this.pendingStruct.add(path)
  }

  /** A tracked `$` key changed (`path:value`, `:meta`, …). */
  bumpDep(dep: string): void {
    this.depVersion.set(dep, (this.depVersion.get(dep) ?? 0) + 1)
    this.pendingDepNotify.add(dep)
  }

  bumpMeta(): void {
    this.metaVersion += 1
    this.pendingMeta = true
    this.bumpDep(':meta')
  }

  /** Deliver everything pending: paths, structures, meta, deps, then debug listeners. */
  emit(): void {
    this.debugVersion += 1
    const paths = [...this.pendingPaths]
    const structs = [...this.pendingStruct]
    this.pendingPaths.clear()
    this.pendingStruct.clear()
    for (const path of paths) this.pathListeners.get(path)?.forEach((fn) => fn())
    for (const path of structs) this.structListeners.get(path)?.forEach((fn) => fn())
    if (this.pendingMeta) {
      this.pendingMeta = false
      this.metaListeners.forEach((fn) => fn())
    }
    const deps = [...this.pendingDepNotify]
    this.pendingDepNotify.clear()
    for (const dep of deps) this.depListeners.get(dep)?.forEach((fn) => fn())
    this.debugListeners.forEach((fn) => fn())
  }
}

function addListener(map: Map<string, Set<() => void>>, key: string, listener: () => void): () => void {
  let set = map.get(key)
  if (!set) map.set(key, (set = new Set()))
  set.add(listener)
  const listeners = set
  let stopped = false
  return () => {
    if (stopped) return
    stopped = true
    listeners.delete(listener)
    if (!listeners.size && map.get(key) === listeners) map.delete(key)
  }
}
