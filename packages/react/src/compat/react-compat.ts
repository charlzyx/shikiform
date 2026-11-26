import React from 'react'
import { copyData } from '@shikiform/core/internal'

// Re-export React APIs via default import so ESM output uses only `import React from 'react'`
// (React 16.8 CJS modules do not expose statically detectable named exports in native Node ESM).
export const {
  Children,
  cloneElement,
  createContext,
  forwardRef,
  isValidElement,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} = React

type UseSyncExternalStoreFn = <Snapshot>(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => Snapshot,
  getServerSnapshot?: () => Snapshot,
) => Snapshot

// Indirect lookup keeps bundlers (Webpack 4/5, Rollup, Vite) from warning on React 16.8/17
// where `useSyncExternalStore` and `useId` are not exported.
const reactNs = React as unknown as Record<string, unknown>

const nativeUseSyncExternalStore =
  typeof reactNs['useSyncExternalStore'] === 'function'
    ? (reactNs['useSyncExternalStore'] as UseSyncExternalStoreFn)
    : undefined

const nativeUseId =
  typeof reactNs['useId'] === 'function'
    ? (reactNs['useId'] as () => string)
    : undefined

function isServerEnvironment(): boolean {
  return (
    typeof window === 'undefined' ||
    typeof window.document === 'undefined' ||
    typeof window.document.createElement === 'undefined'
  )
}

interface StoreInst<Snapshot> {
  value: Snapshot
  getSnapshot: () => Snapshot
}

function checkIfSnapshotChanged<Snapshot>(inst: StoreInst<Snapshot>): boolean {
  const latestGetSnapshot = inst.getSnapshot
  const prevValue = inst.value
  try {
    const nextValue = latestGetSnapshot()
    return !Object.is(prevValue, nextValue)
  } catch {
    return true
  }
}

/**
 * React 16.8 / 17 synchronous fallback for `React.useSyncExternalStore`.
 * Matches `use-sync-external-store/shim` semantics with zero runtime dependencies.
 * Exported from this internal module so unit tests can exercise it under React 18/19.
 */
export function useSyncExternalStoreFallback<Snapshot>(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => Snapshot,
  getServerSnapshot?: () => Snapshot,
): Snapshot {
  const server = isServerEnvironment()
  const readSnapshot = server && getServerSnapshot ? getServerSnapshot : getSnapshot
  const value = readSnapshot()

  const [{ inst }, forceUpdate] = useState<{ inst: StoreInst<Snapshot> }>(() => ({
    inst: { value, getSnapshot: readSnapshot },
  }))

  // On the client, sync `inst` and check for pre-commit mutations synchronously in `useLayoutEffect`.
  // On the server, use `useEffect` so React 16.8/17 do not warn about `useLayoutEffect` during SSR.
  const useCommitEffect = server ? useEffect : useLayoutEffect
  useCommitEffect(() => {
    inst.value = value
    inst.getSnapshot = readSnapshot
    if (checkIfSnapshotChanged(inst)) {
      forceUpdate({ inst })
    }
  })

  useEffect(() => {
    let active = true
    if (checkIfSnapshotChanged(inst)) {
      forceUpdate({ inst })
    }
    const handleStoreChange = () => {
      if (!active) return
      if (checkIfSnapshotChanged(inst)) {
        forceUpdate({ inst })
      }
    }
    const unsubscribe = subscribe(handleStoreChange)
    return () => {
      active = false
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [subscribe])

  return value
}

let fallbackIdCounter = 0

/**
 * React 16.8 / 17 fallback for `React.useId()`.
 * Generates a stable per-mount DOM-safe prefix (`shiki-r1`, `shiki-r2`, ...).
 * React 16.8/17 SSR apps should pass an explicit `<Form id="...">` to avoid hydration mismatches.
 */
export function useIdFallback(): string {
  const ref = useRef<string | null>(null)
  if (ref.current === null) {
    ref.current = `shiki-r${++fallbackIdCounter}`
  }
  return ref.current
}

/**
 * React 18/19: delegates directly to `React.useSyncExternalStore` (full concurrent tearing safety).
 * React 16.8/17: uses {@link useSyncExternalStoreFallback}.
 */
export const useSyncExternalStore: UseSyncExternalStoreFn =
  nativeUseSyncExternalStore ?? useSyncExternalStoreFallback

/**
 * React 18/19: delegates directly to `React.useId`.
 * React 16.8/17: uses {@link useIdFallback}.
 */
export const useId: () => string = nativeUseId ?? useIdFallback

/**
 * Deep-clone form data safely even when `structuredClone` is missing (Node < 17 / older browsers)
 * or rejects non-cloneable values (development read-only proxies, functions, class instances).
 */
export function safeClone<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== 'object') return value
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value)
    } catch {
      // Fall through to copyData (handles dev proxies, Dates, Maps, Sets, class instances).
    }
  }
  return copyData(value)
}
