import { describe, expect, it } from 'vitest'
import { comboMatch, comboOptions } from '@shikiform/core'
import { asOptions, isEnumBinding } from '../packages/core/src/enum/enum-source'

type Row = { color: string; storage: string; stock: number }

const TABLE: Row[] = [
  { color: '红', storage: '128G', stock: 0 },
  { color: '红', storage: '256G', stock: 5 },
  { color: '蓝', storage: '128G', stock: 3 },
  { color: '蓝', storage: '256G', stock: 0 },
]

describe('comboMatch', () => {
  it('is true when at least one row matches every selected dimension', () => {
    expect(comboMatch(TABLE, { color: '红', storage: '256G' })).toBe(true)
    expect(comboMatch(TABLE, { color: '蓝', storage: '256G' })).toBe(true)
  })

  it('is false when no row matches', () => {
    expect(comboMatch(TABLE, { color: '绿' })).toBe(false)
    expect(comboMatch([], { color: '红' })).toBe(false)
  })

  it('empty / null selections are ignored', () => {
    expect(comboMatch(TABLE, { color: null, storage: '' })).toBe(true)
    expect(comboMatch(TABLE, {})).toBe(true)
    expect(comboMatch(TABLE, { color: '红', storage: null })).toBe(true)
  })

  it('a null selection still constrains the other keys', () => {
    expect(comboMatch(TABLE, { color: '绿', storage: null })).toBe(false)
  })
})

describe('comboOptions', () => {
  it('returns the distinct values of a dimension among rows matching the other selections', () => {
    expect(comboOptions(TABLE, { color: '红' }, 'storage').map((option) => option.value)).toEqual(['128G', '256G'])
    expect(comboOptions(TABLE, {}, 'color').map((option) => option.label)).toEqual(['红', '蓝'])
  })

  it('the dimension itself is not filtered by its own selection', () => {
    // 选了 128G 后再开 128G 的下拉，128G 仍在（其他维度才过滤）
    expect(comboOptions(TABLE, { color: '红', storage: '128G' }, 'storage').map((option) => option.value)).toEqual([
      '128G',
      '256G',
    ])
  })

  it('disabledWhen sees the rows that produced one value', () => {
    const out = comboOptions(TABLE, { color: '红' }, 'storage', { disabledWhen: (rows) => rows.every((row) => row.stock === 0) })
    expect(out.find((option) => option.value === '128G')!.disabled).toBe(true)
    expect(out.find((option) => option.value === '256G')!.disabled).toBe(false)
  })

  it('no matching rows gives an empty list; disabledWhen defaults to false', () => {
    expect(comboOptions(TABLE, { color: '绿' }, 'storage')).toEqual([])
    expect(comboOptions(TABLE, {}, 'storage').every((option) => option.disabled === false)).toBe(true)
  })
})

describe('asOptions', () => {
  it('passes through option objects, wraps bare values, and rejects non-arrays', () => {
    expect(asOptions(['a', 'b'])).toEqual([
      { label: 'a', value: 'a' },
      { label: 'b', value: 'b' },
    ])
    expect(asOptions([{ label: '甲', value: 1 }])).toEqual([{ label: '甲', value: 1 }])
    expect(asOptions(['x', { label: '乙', value: 2 }])).toEqual([
      { label: 'x', value: 'x' },
      { label: '乙', value: 2 },
    ])
    expect(asOptions(undefined)).toBeUndefined()
    expect(asOptions('nope')).toBeUndefined()
    expect(asOptions({ label: 'x' })).toBeUndefined()
  })

  it('a null entry becomes { label: "", value: null } (String(null))', () => {
    expect(asOptions([null])).toEqual([{ label: 'null', value: null }])
  })
})

describe('isEnumBinding', () => {
  it('is true only for { kind: "enum" } objects', () => {
    expect(isEnumBinding({ kind: 'enum', source: {}, params: {} })).toBe(true)
    expect(isEnumBinding([{ label: 'a', value: 1 }])).toBe(false)
    expect(isEnumBinding('enum')).toBe(false)
    expect(isEnumBinding(null)).toBe(false)
    expect(isEnumBinding(undefined)).toBe(false)
    expect(isEnumBinding({ kind: 'other' })).toBe(false)
  })
})
