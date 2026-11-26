// @vitest-environment happy-dom
import React, { Component, StrictMode, useState, type ReactNode } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  safeClone,
  useId,
  useIdFallback,
  useSyncExternalStore,
  useSyncExternalStoreFallback,
} from '../../../packages/react/src/compat/react-compat'
import { createForm } from '@shikiform/core'

afterEach(cleanup)

function createStore<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set: (next: T) => {
      value = next
      for (const listener of [...listeners]) listener()
    },
    setSilent: (next: T) => {
      value = next
    },
    notify: () => {
      for (const listener of [...listeners]) listener()
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    listenerCount: () => listeners.size,
  }
}

describe('React 16.8/17 compatibility layer', () => {
  it('delegates directly to native React.useSyncExternalStore and React.useId on React 18/19', () => {
    expect(useSyncExternalStore).toBe(React.useSyncExternalStore)
    expect(useId).toBe(React.useId)
  })

  describe('useSyncExternalStoreFallback', () => {
    it('subscribes to store updates, uses Object.is equality, and cleans up on unmount', () => {
      const store = createStore<number>(0)
      let renders = 0
      function View() {
        renders += 1
        const val = useSyncExternalStoreFallback(store.subscribe, store.get, store.get)
        return <span data-testid="val">{Object.is(val, -0) ? '-0' : String(val)}</span>
      }

      const { getByTestId, unmount } = render(<View />)
      expect(getByTestId('val').textContent).toBe('0')
      expect(renders).toBe(1)
      expect(store.listenerCount()).toBe(1)

      // Same value via Object.is: no extra render
      act(() => store.set(0))
      expect(renders).toBe(1)

      // +0 -> -0 distinguished by Object.is
      act(() => store.set(-0))
      expect(getByTestId('val').textContent).toBe('-0')
      expect(renders).toBe(2)

      // NaN -> NaN treated equal by Object.is
      act(() => store.set(Number.NaN))
      expect(getByTestId('val').textContent).toBe('NaN')
      const rendersAtNaN = renders
      act(() => store.set(Number.NaN))
      expect(renders).toBe(rendersAtNaN)

      // Normal update
      act(() => store.set(42))
      expect(getByTestId('val').textContent).toBe('42')

      // Unmount cleans up subscription
      unmount()
      expect(store.listenerCount()).toBe(0)
    })

    it('detects stale snapshots mutated between render and commit (tearing guard)', () => {
      const store = createStore('initial')
      let mutated = false
      function View() {
        const val = useSyncExternalStoreFallback(store.subscribe, store.get, store.get)
        // Simulate a concurrent/render-phase external mutation before commit effects run.
        if (!mutated) {
          mutated = true
          store.setSilent('mutated-before-commit')
        }
        return <span data-testid="val">{val}</span>
      }

      const { getByTestId } = render(<View />)
      expect(getByTestId('val').textContent).toBe('mutated-before-commit')
    })

    it('works cleanly under React StrictMode double-mount and catches mutations between unmount and remount', () => {
      const store = createStore('v1')
      let subscribeCount = 0
      let unsubscribeCount = 0
      const subscribe = (listener: () => void) => {
        subscribeCount += 1
        const stop = store.subscribe(listener)
        return () => {
          unsubscribeCount += 1
          stop()
          // Mutate while unsubscribed during StrictMode cleanup -> remount must pick it up!
          if (unsubscribeCount === 1) store.setSilent('v2-during-remount')
        }
      }

      function View() {
        const val = useSyncExternalStoreFallback(subscribe, store.get, store.get)
        return <span data-testid="val">{val}</span>
      }

      const { getByTestId, unmount } = render(
        <StrictMode>
          <View />
        </StrictMode>,
      )

      expect(getByTestId('val').textContent).toBe('v2-during-remount')
      expect(subscribeCount).toBeGreaterThanOrEqual(2)
      expect(store.listenerCount()).toBe(1)

      act(() => store.set('v3'))
      expect(getByTestId('val').textContent).toBe('v3')

      unmount()
      expect(store.listenerCount()).toBe(0)
    })

    it('handles rapidly changing subscribe functions without leaking listeners or looping', () => {
      const storeA = createStore('A1')
      const storeB = createStore('B1')
      let setUseB!: (next: boolean) => void
      let renders = 0

      function View() {
        renders += 1
        const [useB, _setUseB] = useState(false)
        setUseB = _setUseB
        const activeStore = useB ? storeB : storeA
        // New inline subscribe closure on every render (mirrors useField / useArrayField).
        const val = useSyncExternalStoreFallback(
          (cb) => activeStore.subscribe(cb),
          () => activeStore.get(),
          () => activeStore.get(),
        )
        return <span data-testid="val">{val}</span>
      }

      const { getByTestId, unmount } = render(<View />)
      expect(getByTestId('val').textContent).toBe('A1')
      expect(storeA.listenerCount()).toBe(1)
      expect(storeB.listenerCount()).toBe(0)

      act(() => storeA.set('A2'))
      expect(getByTestId('val').textContent).toBe('A2')

      // Switch subscription to storeB
      act(() => setUseB(true))
      expect(getByTestId('val').textContent).toBe('B1')
      expect(storeA.listenerCount()).toBe(0)
      expect(storeB.listenerCount()).toBe(1)

      // StoreA updates should no longer re-render
      const rendersBefore = renders
      act(() => storeA.set('A3'))
      expect(renders).toBe(rendersBefore)

      // StoreB updates should re-render
      act(() => storeB.set('B2'))
      expect(getByTestId('val').textContent).toBe('B2')

      unmount()
      expect(storeA.listenerCount()).toBe(0)
      expect(storeB.listenerCount()).toBe(0)
    })

    it('ignores late listener callbacks fired after unmount without warning', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      let leakedListener: (() => void) | null = null
      let value = 1
      const buggySubscribe = (cb: () => void) => {
        leakedListener = cb
        return () => {
          // Intentionally fail to clear leakedListener to simulate a late callback
        }
      }

      function View() {
        const val = useSyncExternalStoreFallback(buggySubscribe, () => value, () => value)
        return <span>{val}</span>
      }

      const { unmount } = render(<View />)
      unmount()

      value = 2
      expect(() => leakedListener?.()).not.toThrow()
      expect(consoleError).not.toHaveBeenCalled()
      consoleError.mockRestore()
    })

    it('uses getServerSnapshot during SSR (when window is undefined) without useLayoutEffect warnings', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const originalWindow = globalThis.window
      vi.stubGlobal('window', undefined)
      try {
        const subscribe = vi.fn(() => () => {})
        const getClient = vi.fn(() => 'client')
        const getServer = vi.fn(() => 'server')

        function ServerView() {
          const val = useSyncExternalStoreFallback(subscribe, getClient, getServer)
          return <div>{val}</div>
        }

        const html = renderToString(<ServerView />)
        expect(html).toBe('<div>server</div>')
        expect(getServer).toHaveBeenCalled()
        expect(getClient).not.toHaveBeenCalled()
        expect(subscribe).not.toHaveBeenCalled()
        expect(consoleError).not.toHaveBeenCalled()
      } finally {
        vi.stubGlobal('window', originalWindow)
        consoleError.mockRestore()
      }
    })

    it('forces re-render when getSnapshot throws in a subscription callback so an ErrorBoundary catches it', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      let shouldThrow = false
      const store = createStore(1)

      class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
        state = { error: null as Error | null }
        static getDerivedStateFromError(error: Error) {
          return { error }
        }
        render() {
          if (this.state.error) return <span data-testid="err">{this.state.error.message}</span>
          return this.props.children
        }
      }

      function View() {
        const val = useSyncExternalStoreFallback(
          store.subscribe,
          () => {
            if (shouldThrow) throw new Error('snapshot boom')
            return store.get()
          },
          store.get,
        )
        return <span data-testid="ok">{val}</span>
      }

      const { getByTestId } = render(
        <Boundary>
          <View />
        </Boundary>,
      )
      expect(getByTestId('ok').textContent).toBe('1')

      shouldThrow = true
      act(() => store.notify())
      expect(getByTestId('err').textContent).toBe('snapshot boom')
      consoleError.mockRestore()
    })
  })

  describe('useIdFallback', () => {
    it('returns a stable shiki-r<n> id across re-renders and distinct ids across mounts', () => {
      let bump!: () => void
      const seenA: string[] = []
      const seenB: string[] = []

      function Pair() {
        const [n, setN] = useState(0)
        bump = () => setN((c) => c + 1)
        const idA = useIdFallback()
        const idB = useIdFallback()
        seenA.push(idA)
        seenB.push(idB)
        return (
          <div>
            <span data-testid="a">{idA}</span>
            <span data-testid="b">{idB}</span>
            <span data-testid="n">{n}</span>
          </div>
        )
      }

      const { getByTestId } = render(<Pair />)
      const firstA = getByTestId('a').textContent!
      const firstB = getByTestId('b').textContent!
      expect(firstA).toMatch(/^shiki-r\d+$/)
      expect(firstB).toMatch(/^shiki-r\d+$/)
      expect(firstA).not.toBe(firstB)

      act(() => bump())
      act(() => bump())
      expect(getByTestId('a').textContent).toBe(firstA)
      expect(getByTestId('b').textContent).toBe(firstB)
      expect(new Set(seenA).size).toBe(1)
      expect(new Set(seenB).size).toBe(1)
    })
  })

  describe('safeClone', () => {
    it('clones objects, arrays, Dates, Maps, Sets, and dev readonly views even when structuredClone is absent', () => {
      const original = globalThis.structuredClone
      vi.stubGlobal('structuredClone', undefined)
      try {
        const date = new Date('2026-01-01T00:00:00Z')
        const input = {
          nested: { a: 1 },
          list: [1, 2, 3],
          date,
          map: new Map([['k', { v: 1 }]]),
          set: new Set(['x']),
        }
        const copy = safeClone(input)
        expect(copy).toEqual(input)
        expect(copy).not.toBe(input)
        expect(copy.nested).not.toBe(input.nested)
        expect(copy.date).toBeInstanceOf(Date)
        expect(copy.date).not.toBe(date)
        expect(copy.map).toBeInstanceOf(Map)
        expect(copy.set).toBeInstanceOf(Set)

        // Dev readonly view from form.values must clone cleanly too
        const form = createForm({ initialValues: { user: { name: 'Ada' }, tags: ['a'] } })
        const clonedValues = safeClone(form.values)
        expect(clonedValues).toEqual({ user: { name: 'Ada' }, tags: ['a'] })
        clonedValues.user.name = 'Grace'
        expect(form.getValue('user.name')).toBe('Ada')
      } finally {
        vi.stubGlobal('structuredClone', original)
      }
    })
  })
})
