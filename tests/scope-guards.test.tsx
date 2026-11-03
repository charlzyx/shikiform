// @vitest-environment happy-dom
// Scope hooks: missing context throws ShikiUsageError (with the fix) in development; production throws a plain Error.
import { cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createForm, Form, useIndex, useRecord, useTreeNode } from '../src'
import { useArray } from '../src/react/hooks/use-array'
import { useRequiredForm } from '../src/react/context'
import { ShikiUsageError } from '../src/core'
import { useShadow } from '../src/antd/shadow/shadow'
import { useArrayShadow } from '../src/pro/use-array-shadow'

afterEach(cleanup)

// useRecord reaches the form before the row check, so give it a <Form>.
function withForm(hook: () => unknown) {
  const form = createForm({ initialValues: {} })
  return function Wrapper({ children }: { children?: ReactNode }) {
    return <Form form={form}>{children}</Form>
  }
}
void withForm

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
    ['useArrayShadow', () => useArrayShadow('rows')],
  ])('%s names the fix', (_name, hook) => {
    expect(() => renderHook(hook)).toThrow(ShikiUsageError)
  })

  it('useArrayShadow without a form names the option', () => {
    expect(() => renderHook(() => useArrayShadow('rows'))).toThrow(/surrounding <Form> or a `form` option/)
  })
})

describe('production builds skip the usage message but still fail loudly', () => {
  it.each<[string, () => unknown]>([
    ['useArray', () => useArray()],
    ['useIndex', () => useIndex()],
    ['useTreeNode', () => useTreeNode()],
  ])('%s throws a plain Error outside a scope', (_name, hook) => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      expect(() => renderHook(hook)).toThrow(/use(Array|Index|TreeNode)/)
      expect(() => renderHook(hook)).not.toThrow(ShikiUsageError)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
