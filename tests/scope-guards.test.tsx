// @vitest-environment happy-dom
// Scope hooks: missing context throws ShikiUsageError (with the fix) in development; production throws a plain Error.
import { cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createForm, Form, useIndex, useRecord, useTreeNode } from '@shikiform/react'
import { useArray } from '../packages/react/src/hooks/use-array'
import { ShikiUsageError } from '@shikiform/core'
import { useShadow } from '../packages/antd/src/shadow/shadow'
import { useShadowForm } from '@shikiform/hooks'

afterEach(cleanup)

describe('scope hooks throw ShikiUsageError in development', () => {
  it('useRecord (needs a form first) names the row scope', () => {
    const form = createForm({ initialValues: {} })
    function Wrapper({ children }: { children?: ReactNode }) {
      return <Form form={form}>{children}</Form>
    }
    expect(() => renderHook(() => useRecord(), { wrapper: Wrapper })).toThrow(ShikiUsageError)
    expect(() => renderHook(() => useRecord(), { wrapper: Wrapper })).toThrow(/inside an array row.*or a tree node/)
  })

  it.each<[string, () => unknown]>([
    ['useArray', () => useArray()],
    ['useIndex', () => useIndex()],
    ['useTreeNode', () => useTreeNode()],
    ['useShadow', () => useShadow()],
    ['useShadowForm({ name })', () => useShadowForm({ name: 'rows' })],
    ['useShadowForm({ add })', () => useShadowForm({ add: true })],
  ])('%s names the fix', (_name, hook) => {
    expect(() => renderHook(hook)).toThrow(ShikiUsageError)
  })

  it('useShadowForm({ name }) without a form names the option', () => {
    expect(() => renderHook(() => useShadowForm({ name: 'rows' }))).toThrow(/surrounding <Form> or a `form` option/)
  })

  it('useShadowForm({ add }) without a bound path names the requirement', () => {
    const form = createForm({ initialValues: { rows: [] } })
    expect(() => renderHook(() => useShadowForm({ form, add: true }))).toThrow(/bound array path/)
  })
})

describe('production builds skip the usage message but still fail loudly', () => {
  it.each<[string, () => unknown]>([
    ['useArray', () => useArray()],
    ['useIndex', () => useIndex()],
    ['useTreeNode', () => useTreeNode()],
    ['useShadowForm({ name })', () => useShadowForm({ name: 'rows' })],
    ['useShadowForm({ add })', () => useShadowForm({ add: true })],
  ])('%s throws a plain Error outside a scope', (_name, hook) => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      expect(() => renderHook(hook)).toThrow(/use(Array|Index|TreeNode|ShadowForm)/)
      expect(() => renderHook(hook)).not.toThrow(ShikiUsageError)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
