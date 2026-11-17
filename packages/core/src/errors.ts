/**
 * `submit()` lost the race: a later `submit()` replaced it, or the values kept changing and the bounded
 * retries never settled. Not a validation failure — catch it apart from `FieldError[]` (`instanceof`, or `code`).
 * `message` is `messages.superseded`.
 */
export class SubmitSupersededError extends Error {
  readonly code = 'superseded' as const

  constructor(message: string) {
    super(message)
    this.name = 'SubmitSupersededError'
  }
}

/** A reaction or watch pass did not settle within the fixed iteration budget. */
export class ShikiCycleError extends Error {
  readonly cycle: readonly string[]

  constructor(cycle: readonly string[], detail?: string) {
    super(detail ?? `Reaction did not converge after 10 passes: ${cycle.join(' → ')}`)
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

  constructor(state: string, first: string, second: string, detail?: string) {
    super(detail ?? `State ${state} is written by ${first} and ${second}`)
    this.name = 'ShikiConflictError'
    this.state = state
    this.first = first
    this.second = second
  }
}

/**
 * A draft misuse caught in development (`process.env.NODE_ENV !== 'production'`): mutating a `$value` object,
 * reading a `$` state right after writing it in the same reaction, or treating a draft handle as an array.
 * The message says what to write instead.
 */
export class ShikiUsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ShikiUsageError'
  }
}

/** `items.0.name` → `d.items[0].name` (root → `d`), for messages. */
export function showDraftPath(path: string): string {
  if (!path) return 'd'
  return 'd' + path.split('.').map((seg) => (/^\d+$/.test(seg) ? `[${seg}]` : `.${seg}`)).join('')
}

const STATE_KEY: Record<string, string> = { structure: '(rows)', meta: '(form state)' }

/** A dep / write key `items.0.cost:value` → `d.items[0].cost.$value`, for messages. */
export function showStateKey(key: string): string {
  const at = key.lastIndexOf(':')
  const path = key.slice(0, at)
  const state = key.slice(at + 1)
  const hash = path.indexOf('#')
  const base = hash < 0 ? showDraftPath(path) : `${showDraftPath(path.slice(0, hash))}.$ui('${path.slice(hash + 1)}')`
  return STATE_KEY[state] ? `${base} ${STATE_KEY[state]}` : `${base}.$${state}`
}

/**
 * Development only: the first stack frame outside this library, `file:line:col`, so an error can say which
 * `reaction(...)` call it means. The library frames are those in the file of the caller's caller (one bundle in dist).
 */
export function callSite(): string | undefined {
  const stack = new Error().stack
  if (!stack) return undefined
  const frames = stack
    .split('\n')
    .map((line) => /\(?((?:[a-z]+:\/\/\/?|\/|[A-Za-z]:\\)[^()\s]*?):(\d+):(\d+)\)?\s*$/.exec(line.trim()))
    .filter((m): m is RegExpExecArray => !!m)
  if (frames.length < 2) return undefined
  const own = new Set([frames[0][1], frames[1][1]])
  const user = frames.find((m) => !own.has(m[1]))
  if (!user) return undefined
  let file = user[1].replace(/[?#].*$/, '').replace(/^file:\/\//, '')
  const cwd = typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : ''
  if (cwd && file.startsWith(cwd + '/')) file = file.slice(cwd.length + 1)
  else file = file.replace(/^[a-z]+:\/\/[^/]+\//, '')
  return `${file}:${user[2]}:${user[3]}`
}
