import { describe, expect, it, vi } from 'vitest'
import { defineEffects, ShikiUsageError } from '@shikiform/core'
import { withReaction as withReactionFixture } from './fixtures/reaction-utils'
import { createEngine, engineOf } from '../packages/core/src/engine/create'

type V = { user: { name: string; tags: string[] }; items: { n: number }[]; total: number; copy: { name: string; tags: string[] } | null; count: number }
const initialValues = (): V => ({ user: { name: 'a', tags: ['x'] }, items: [{ n: 1 }, { n: 2 }], total: 0, copy: null, count: 1 })

const withReaction = (effect: (d: any) => void) => withReactionFixture(effect, initialValues())

describe('development usage errors (with the fix in the message)', () => {
  it('inside a reaction, nested $value writes and array mutators are recorded', () => {
    const form = createEngine({ initialValues: initialValues() })
    form.batch((d) => {
      d.user.$value.name = 'Ada'
      const items = d.items.$value
      items.push({ n: 4 })
      items[0].n = 3
      d.user.tags.$value.sort()
      delete (d.user.$value as { tags?: string[] }).tags
    })
    expect(form.getValue('user')).toEqual({ name: 'Ada' })
    expect(form.getValue('items')).toEqual([{ n: 3 }, { n: 2 }, { n: 4 }])
  })

  it('outside an effect, getValue and form.values stay read-only', () => {
    const form = createEngine({ initialValues: initialValues() })
    expect(() => { (form.getValue('user') as { name: string }).name = 'x' }).toThrow(ShikiUsageError)
    expect(() => { (form.getValue('user') as { name: string }).name = 'x' }).toThrow(/form\.setValue/)
    expect(() => { (form.getValue('items') as { n: number }[]).push({ n: 3 }) }).toThrow(/useArrayField\(\)\.push/)
    expect(() => { (form.values.user as { name: string }).name = 'x' }).toThrow(ShikiUsageError)
    expect(() => { delete (form.getValue('user') as { tags?: string[] }).tags }).toThrow(/read-only/)
  })

  it('non-mutating use of $value still works, and writes store plain data', () => {
    const form = withReaction((d) => {
      d.total.$value = d.items.$value.map((row: { n: number }) => row.n).reduce((a: number, b: number) => a + b, 0)
      d.copy.$value = d.user.$value
    })()
    expect(form.getValue('total')).toBe(3)
    const copy = form.getValue('copy')!
    expect(copy).toEqual({ name: 'a', tags: ['x'] })
    expect(() => { copy.name = 'outside' }).toThrow(ShikiUsageError)
    expect(form.getValue('copy')).toEqual({ name: 'a', tags: ['x'] })
    expect(() => structuredClone(form.getSubmitValues())).not.toThrow()
  })

  it('reading $value back in the same reaction sees the write; flags still throw', () => {
    let seen = 0
    const form = withReaction((d) => {
      d.total.$value = 9
      seen = d.total.$value
    })()
    expect(seen).toBe(9)
    expect(form.getValue('total')).toBe(9)
    expect(
      withReaction((d) => {
        d.total.$visible = false
        void d.total.$visible
      }),
    ).toThrow(/after writing it in the same reaction.*const next = …/)
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

  it('rest, spread, Object.keys and array destructuring throw and name the child-handle form', () => {
    expect(withReaction((d) => { Object.keys(d.user) })).toThrow(/Object\.keys\(d\.user\).*const \{ name \} = d\.user.*name\.\$value/)
    expect(withReaction((d) => { const copy = { ...d.user }; void copy })).toThrow(/object spread/)
    expect(withReaction((d) => { const { name, ...rest } = d.user; void name; void rest })).toThrow(/rest/)
    expect(withReaction((d) => { const [row] = d.items; void row })).toThrow(/const \[row\] = d\.items.*reaction\.each/)
    const form = withReaction((d) => {
      const { name, tags } = d.user
      d.total.$value = name.$value.length + tags.$value.length
    })()
    expect(form.getValue('total')).toBe(2)
  })

  it('a field literally named length is still a path when the value is not an array', () => {
    const form = createEngine({ initialValues: { box: { length: 3 } } })
    expect((form.draft as any).box.length.$value).toBe(3)
  })
})

describe('production builds skip the guards', () => {
  const prod = (fn: (d: any) => void) => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      return withReaction(fn)()
    } finally {
      vi.unstubAllEnvs()
    }
  }

  it('returns raw values and does not check read-after-write', () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      let raw: unknown
      const form = withReaction((d) => {
        raw = d.user.$value
        d.total.$value = 1
        void d.total.$value
      })()
      expect(raw).toEqual(form.getValue('user'))
      // Inside the effect the value is a draft, in dev and production. Outside, production returns the stored object.
      expect(raw).not.toBe(form.getValue('user'))
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('a nested $value write in an effect commits in production too', () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      const form = createEngine({ initialValues: initialValues() })
      form.batch((d) => {
        d.user.$value.name = 'x'
        d.items.$value.push({ n: 3 })
      })
      expect(form.getValue('user')).toEqual({ name: 'x', tags: ['x'] })
      expect(form.getValue('items')).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }])
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('reading a $ state after writing it in the same pass returns the written value', () => {
    const form = prod((d) => {
      d.total.$value = 5
      return d.total.$value
    })
    expect(form.getValue('total')).toBe(5)
  })

  it('enumerating a handle does not throw the guided error', () => {
    let keys: string[] = []
    let copied: string[] = []
    expect(prod((d) => { keys = Object.keys(d.user) }).getValue('user')).toEqual({ name: 'a', tags: ['x'] })
    expect(keys).toEqual([])
    expect(
      prod((d) => {
        const copy = { ...d.user }
        copied = Object.keys(copy)
      }).getValue('total'),
    ).toBe(0)
    expect(copied).toEqual([])
    expect(() => prod((d) => { const [row] = d.items; void row })).toThrow(TypeError)
    expect(() => prod((d) => { const [row] = d.items; void row })).not.toThrow(ShikiUsageError)
  })

  it('array methods and .length on a handle do not throw the guided error; $value iteration works', () => {
    // production: 读 `.length` 得到子路径 handle 而非数组长度（没有「用 $value」的守卫提示）
    expect(prod((d) => { void (d.items.length as unknown) }).getValue('items')).toEqual([{ n: 1 }, { n: 2 }])
    // $value 上的迭代照常工作
    expect(prod((d) => { return d.items.$value.reduce((sum: number, row: { n: number }) => sum + row.n, 0) }).getValue('total')).toBe(0)
    // for…of 抛原生 TypeError（handle 不是数组），但没有 ShikiUsageError 守卫提示
    expect(() => prod((d) => { for (const _row of d.items) void _row })).toThrow(TypeError)
    expect(() => prod((d) => { for (const _row of d.items) void _row })).not.toThrow(ShikiUsageError)
  })

  it('misspelled $ keys are not spell-checked (a read yields a child handle, a write is silently dropped)', () => {
    const form = prod((d) => { d.total.$valeu = 9 })
    expect(form.getValue('total')).toBe(0)
    expect(form.getValue('total.$valeu' as never)).toBeUndefined()
  })

  it('writing read-only states ($errors / $canSubmit) is silently ignored', () => {
    const form = prod((d) => { d.total.$errors = ['x'] })
    expect(engineOf(form).query('total').$errors).toEqual([])
  })

  it('a bare property write (d.x.value = …) is ignored without throwing', () => {
    const form = prod((d) => {
      expect(Reflect.set(d.total, 'value', 9)).toBe(true)
      d.total.value = 9
    })
    expect(form.getValue('total')).toBe(0)
  })
})
