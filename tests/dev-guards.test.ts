import { describe, expect, it, vi } from 'vitest'
import { defineEffects, ShikiUsageError } from '../src/core'
import { withReaction as withReactionFixture } from './fixtures/reaction-utils'
import { createEngine, engineOf } from '../src/core/engine/create'

type V = { user: { name: string; tags: string[] }; items: { n: number }[]; total: number; copy: { name: string; tags: string[] } | null; count: number }
const initialValues = (): V => ({ user: { name: 'a', tags: ['x'] }, items: [{ n: 1 }, { n: 2 }], total: 0, copy: null, count: 1 })

const withReaction = (effect: (d: any) => void) => withReactionFixture(effect, initialValues())

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
      expect(raw).toBe(form.getValue('user'))
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('mutating an object read from $value mutates the real value without throwing', () => {
    const form = prod((d) => { d.user.$value.name = 'x' })
    expect(form.getValue('user')).toEqual({ name: 'x', tags: ['x'] })
  })

  it('reading a $ state after writing it in the same pass returns the written value', () => {
    const form = prod((d) => {
      d.total.$value = 5
      return d.total.$value
    })
    expect(form.getValue('total')).toBe(5)
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

  it('a bare property write (d.x.value = …) is a silent no-op: the proxy rejects it without a guide', () => {
    // production 下不抛 ShikiUsageError；引擎代理拒绝写入（原生 set trap 失败，严格模式下是 TypeError），值保持不变
    expect(() => prod((d) => { d.total.value = 9 })).toThrow(TypeError)
    expect(() => prod((d) => { d.total.value = 9 })).not.toThrow(ShikiUsageError)
  })
})
