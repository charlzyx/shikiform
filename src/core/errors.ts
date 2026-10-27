/** A reaction or watch pass did not settle within the fixed iteration budget. */
export class ShikiCycleError extends Error {
  readonly cycle: readonly string[]

  constructor(cycle: readonly string[]) {
    super(`Reaction did not converge after 10 passes: ${cycle.join(' → ')}`)
    this.name = 'ShikiCycleError'
    this.cycle = cycle
  }
}

/**
 * Two different reactions wrote the same `$` state.
 * Pick one writer. `watch` is the right verb when the write is an action, not a derivation.
 */
export class ShikiConflictError extends Error {
  readonly state: string
  readonly first: string
  readonly second: string

  constructor(state: string, first: string, second: string) {
    super(`State ${state} is written by ${first} and ${second}`)
    this.name = 'ShikiConflictError'
    this.state = state
    this.first = first
    this.second = second
  }
}

/** The same `ui` name was mounted twice on one path. */
export class ShikiUiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ShikiUiError'
  }
}
