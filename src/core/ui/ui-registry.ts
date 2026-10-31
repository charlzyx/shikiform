import type { Scheduler } from '../effects/scheduler'
import { ShikiUiError } from '../errors'
import type { FieldStore } from '../state/field-store'
import type { Notifier } from '../state/notifier'
import type { Display, Pattern, WriteOp } from '../types'

interface UiState {
  display?: Display
  hasDisplay: boolean
  pattern?: Pattern
  hasPattern: boolean
}

function uiKey(path: string, name: string): string {
  return `${path}#${name}`
}

function uiDep(path: string, name: string): string {
  return `@ui:${path}#${name}`
}

/**
 * Named UI instances (`d.x.$ui('summary')`) and regions (`d.$ui('aside')`).
 * Display / pattern here are per mount; the field model they sit on is shared.
 */
export class UiRegistry {
  private uis = new Map<string, UiState>()
  private mounts = new Set<string>()

  constructor(
    private readonly store: FieldStore<any>,
    private readonly notifier: Notifier,
    private readonly scheduler: Scheduler,
  ) {}

  read(path: string, name: string, key: string): unknown {
    const ui = this.uis.get(uiKey(path, name))
    this.scheduler.track(uiDep(path, name), 'display')
    if (key === '$visible') return ui?.hasDisplay ? ui.display !== 'hidden' && ui.display !== 'none' : true
    if (key === '$display') return ui?.hasDisplay ? ui.display : 'visible'
    if (key === '$pattern') return ui?.hasPattern ? ui.pattern : undefined
    return undefined
  }

  write(path: string, name: string, key: string, value: unknown): void {
    const scheduler = this.scheduler
    const op: WriteOp = {
      key: `${uiDep(path, name)}:${key === '$pattern' ? 'pattern' : 'display'}`,
      apply: () => {
        const ui = this.ensure(path, name)
        if (key === '$pattern') {
          ui.hasPattern = value !== undefined
          ui.pattern = value as Pattern | undefined
        } else if (key === '$visible') {
          ui.hasDisplay = true
          ui.display = value ? 'visible' : 'none'
        } else if (key === '$display') {
          ui.hasDisplay = true
          ui.display = value as Display
        } else return false
        this.notifier.bumpPath(path)
        scheduler.markDirty(op.key)
        return true
      },
    }
    const tracker = scheduler.current()
    if (tracker) {
      if (!tracker.recordWrites) return
      tracker.writes.push(op)
      return
    }
    if (scheduler.batchDepth > 0) {
      scheduler.batchOps.push(op)
      return
    }
    op.apply()
    scheduler.enqueueFromDirty()
    scheduler.flush()
  }

  claim(path: string, name: string): void {
    const key = uiKey(path, name)
    if (this.mounts.has(key) && process.env.NODE_ENV !== 'production') {
      throw new ShikiUiError(`ui "${name}" is already mounted on ${path || 'root'}`)
    }
    this.mounts.add(key)
  }

  release(path: string, name: string): void {
    this.mounts.delete(uiKey(path, name))
  }

  /** False when the field display is not `visible`, or when the named UI / region is hidden. */
  visible(path: string, name: string | undefined, region: string | undefined): boolean {
    if (this.store.effectiveDisplay(path) !== 'visible') return false
    if (region && this.hidden('', region)) return false
    if (name && this.hidden(path, name)) return false
    return true
  }

  private hidden(path: string, name: string): boolean {
    const ui = this.uis.get(uiKey(path, name))
    return !!ui?.hasDisplay && (ui.display === 'hidden' || ui.display === 'none')
  }

  private ensure(path: string, name: string): UiState {
    const key = uiKey(path, name)
    let ui = this.uis.get(key)
    if (!ui) {
      ui = { hasDisplay: false, hasPattern: false }
      this.uis.set(key, ui)
    }
    return ui
  }
}
