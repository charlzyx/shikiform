import { describe, expect, it, vi } from 'vitest'
import { createForm, defineEffects, ShikiUsageError } from '../src/core'

type V = { user: { name: string; tags: string[] }; items: { n: number }[]; total: number; copy: { name: string; tags: string[] } | null; count: number }
const initialValues = (): V => ({ user: { name: 'a', tags: ['x'] }, items: [{ n: 1 }, { n: 2 }], total: 0, copy: null, count: 1 })

function withReaction(effect: (d: any) => void) {
  return () =>
    createForm<V>({
      initialValues: initialValues(),
      effects: [defineEffects<V>(({ reaction }) => reaction(effect))],
    })
}

describe('development usage errors (with the fix in the message)', () => {
  it('mutating an object read from $value throws and names the path write', () => {
    expect(withReaction((d) => { d.user.$value.name = 'x' })).toThrow(ShikiUsageError)
    expect(withReaction((d) => { d.user.$value.name = 'x' })).toThrow(/d\.user\.name\.\$value = …/)
    expect(withReaction((d) => { delete d.user.$value.tags })).toThrow(/read-only/)
    expect(withReaction((d) => { d.items.$value[0].n = 3 })).toThrow(/d\.items\[0\]\.n\.\$value = …/)
  })

  it('array mutators on $value throw and suggest assigning a new array', () => {
    expect(withReaction((d) => { d.items.$value.push({ n: 3 }) })).toThrow(/d\.items\.\$value = \[\.\.\.d\.items\.\$value, row\]/)
    expect(withReaction((d) => { d.user.tags.$value.sort() })).toThrow(ShikiUsageError)
  })

  it('non-mutating use of $value still works, and writes store plain data', () => {
    const form = withReaction((d) => {
      d.total.$value = d.items.$value.map((row: { n: number }) => row.n).reduce((a: number, b: number) => a + b, 0)
      d.copy.$value = d.user.$value
    })()
    expect(form.getValue('total')).toBe(3)
    const copy = form.getValue('copy')!
    expect(copy).toEqual({ name: 'a', tags: ['x'] })
    expect(() => structuredClone(copy)).not.toThrow()
    copy.name = 'outside' // values outside a reaction are not wrapped
    expect(() => form.getSubmitValues()).not.toThrow()
  })

  it('reading a $ state after writing it in the same reaction throws', () => {
    expect(
      withReaction((d) => {
        d.total.$value = 1
        void d.total.$value
      }),
    ).toThrow(/after writing it in the same reaction.*const next = …/)
    expect(
      withReaction((d) => {
        d.total.$visible = false
        void d.total.$display
      }),
    ).toThrow(ShikiUsageError)
    // UI state replays pending writes, so this is fine
    expect(
      withReaction((d) => {
        d.total.$componentProps.placeholder = 'x'
        void d.total.$componentProps.placeholder
      }),
    ).not.toThrow()
  })

  it('array methods, iteration, and .length on a draft handle throw with a hint', () => {
    expect(withReaction((d) => { d.items.forEach(() => {}) })).toThrow(/d\.items\.\$value\.forEach\(…\).*reaction\.each/)
    expect(withReaction((d) => { d.items.map((x: unknown) => x) })).toThrow(ShikiUsageError)
    expect(
      withReaction((d) => {
        for (const _row of d.items) void _row
      }),
    ).toThrow(/cannot be iterated/)
    expect(withReaction((d) => { void d.items.length })).toThrow(/d\.items\.\$value\.length/)
    expect(withReaction((d) => { d.total.$value = d.count + 1 })).toThrow(/Read d\.count\.\$value/)
  })

  it('a field literally named length is still a path when the value is not an array', () => {
    const form = createForm({ initialValues: { box: { length: 3 } } })
    expect((form.draft as any).box.length.$value).toBe(3)
  })
})

describe('production builds skip the guards', () => {
  it('returns raw values and does not check read-after-write', () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      let raw: unknown
      const form = withReaction((d) => {
        raw = d.user.$value
        d.total.$value = 1
        void d.total.$value
      })()
      expect(raw).toBe(form.getValue('user'))
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
