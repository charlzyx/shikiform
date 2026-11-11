/**
 * Wait for `promise` unless `signal` aborts first. After abort, a later resolve or reject is ignored.
 * The promise's rejection is always observed, so dropping it cannot become an unhandled rejection.
 */
export function settleUnlessAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<Settled<T>> {
  if (signal.aborted) return Promise.resolve({ status: 'aborted' })
  return new Promise((resolve) => {
    let settled = false
    const onAbort = () => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onAbort)
      resolve({ status: 'aborted' })
    }
    signal.addEventListener('abort', onAbort)
    promise.then(
      (value) => {
        if (settled) return
        settled = true
        signal.removeEventListener('abort', onAbort)
        resolve({ status: 'fulfilled', value })
      },
      (reason) => {
        if (settled) return
        settled = true
        signal.removeEventListener('abort', onAbort)
        resolve({ status: 'rejected', reason })
      },
    )
  })
}

/** Observe a rejection and drop the reason. Used for attempts abandoned before they are awaited. */
export function ignoreRejection(promise: Promise<unknown>): void {
  void promise.then(() => {}, () => {})
}

export function isPromise(value: unknown): value is Promise<unknown> {
  return !!value && typeof (value as Promise<unknown>).then === 'function'
}

export type Settled<T> =
  | { status: 'fulfilled'; value: T }
  | { status: 'rejected'; reason: unknown }
  | { status: 'aborted' }
