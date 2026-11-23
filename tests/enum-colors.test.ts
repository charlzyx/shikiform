import { describe, expect, it } from 'vitest'
import { ENUM_COLORS, enumItems } from '@shikiform/react'

describe('ENUM_COLORS', () => {
  it('maps the named colors an option may use; the map itself passes through unknown names', () => {
    expect(ENUM_COLORS.success).toBe('green')
    expect(ENUM_COLORS.processing).toBe('blue')
    expect(ENUM_COLORS.error).toBe('red')
    expect(ENUM_COLORS.warning).toBe('gold')
    expect(ENUM_COLORS.default).toBe('#d9d9d9')
    // 12 个 antd 调色板名字原样映射
    for (const name of ['magenta', 'green', 'cyan', 'purple', 'red', 'orange', 'lime', 'blue', 'volcano', 'gold'] as const) {
      expect((ENUM_COLORS as Record<string, string>)[name]).toBe(name)
    }
  })

  it('enumItems resolves a named color through ENUM_COLORS; other names pass through', () => {
    expect(enumItems('o', [{ label: '哦', value: 'o', color: 'success' }])[0]!.color).toBe('green')
    expect(enumItems('x', [{ label: '外', value: 'x', color: 'weird-name' }])[0]!.color).toBe('weird-name')
  })
})
