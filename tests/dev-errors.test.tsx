// @vitest-environment happy-dom
import { cleanup, render, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ArrayField, createForm, defineEffects, Field, Form, ShikiConflictError, ShikiCycleError, ShikiUsageError, UI, typed, useForm } from '@shikiform/react'
import { useQueryTable } from '@shikiform/hooks'
import { createEngine } from '../packages/core/src/engine/create'

afterEach(cleanup)

/** Render and return the thrown error (React logs the error boundary miss; keep the output quiet). */
function renderError(ui: React.ReactElement): Error {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    render(ui)
  } catch (error) {
    return error as Error
  } finally {
    spy.mockRestore()
  }
  throw new Error('expected render to throw')
}

const Missing = undefined as any

describe('empty component / decorator slot (a bad import)', () => {
  it('<Field component={[undefined]}> names the field and the import', () => {
    const form = createForm({ initialValues: { x: '' } })
    const error = renderError(<Form form={form}><Field name="x" component={[Missing, { a: 1 }]} /></Form>)
    expect(error).toBeInstanceOf(ShikiUsageError)
    expect(error.message).toContain('<Field name="x">: component={[undefined, …]}')
    expect(error.message).toContain('import')
  })

  it('covers decorator, <UI>, <ArrayField component> and fields declarations', () => {
    const form = createForm({ initialValues: { x: '', rows: [] as string[] } })
    expect(renderError(<Form form={form}><Field name="x" decorator={[Missing]} /></Form>).message).toContain('decorator={[undefined')
    expect(renderError(<Form form={form}><UI name="tip" component={[Missing]} /></Form>).message).toContain('<UI name="tip">')
    expect(renderError(<Form form={form}><ArrayField name="rows" component={[Missing]} /></Form>).message).toContain(
      '<ArrayField name="rows">: component={[undefined',
    )
    expect(() => createForm({ initialValues: { x: '' }, fields: { x: { component: [Missing] } } })).toThrow(/fields\['x'\]: component/)
  })
})

describe('<ArrayField> on a value that is not an array', () => {
  it('throws with the path and the fix', () => {
    const form = createForm({ initialValues: { title: 'hello' } })
    const error = renderError(<Form form={form}><ArrayField name={'title' as never}>{() => null}</ArrayField></Form>)
    expect(error).toBeInstanceOf(ShikiUsageError)
    expect(error.message).toContain('d.title.$value is string "hello", not an array')
    expect(error.message).toContain('title: []')
  })

  it('accepts an array and a missing value', () => {
    const form = createForm<{ rows?: string[]; more: string[] }>({ initialValues: { more: ['a'] } })
    expect(() =>
      render(
        <Form form={form}>
          <ArrayField name="rows">{() => null}</ArrayField>
          <ArrayField name="more">{() => null}</ArrayField>
        </Form>,
      ),
    ).not.toThrow()
  })
})

describe('unknown rule keys', () => {
  it('JSX rules: suggests the right key instead of passing silently', () => {
    const form = createForm({ initialValues: { name: '' } })
    const error = renderError(<Form form={form}><Field name="name" rules={{ minLenght: 3 } as never} /></Form>)
    expect(error).toBeInstanceOf(ShikiUsageError)
    expect(error.message).toContain('<Field name="name">: rule key "minLenght" is not a rule. Did you mean "minLength"?')
  })

  it('fields declarations, rows.* templates and $rules', () => {
    expect(() => createForm({ initialValues: { a: '' }, fields: { a: { rules: [{ required: true }, { maxlength: 3 } as never] } } })).toThrow(
      /fields\['a'\]: rule key "maxlength" .*Did you mean "maxLength"/,
    )
    expect(() => createForm({ initialValues: { rows: [{ a: '' }] }, fields: { 'rows.*.a': { rules: { requird: true } as never } } })).toThrow(
      /rule key "requird" .*"required"/,
    )
    expect(() =>
      createEngine<{ a: string }>({
        initialValues: { a: '' },
        effects: [defineEffects<{ a: string }>(({ reaction }) => reaction((d) => { d.a.$rules = [{ formt: 'email' } as never] }))],
      }),
    ).toThrow(/d\.a\.\$rules: rule key "formt" .*"format"/)
  })

  it('schemas and every documented key pass', () => {
    expect(() =>
      createForm({
        initialValues: { a: '' },
        fields: {
          a: {
            rules: [
              { required: true, message: 'x' },
              { min: 1, max: 2, minLength: 1, maxLength: 2, pattern: /x/, format: 'email', isTrue: true, level: 'warning' },
              { validator: () => undefined },
              { '~standard': { version: 1, vendor: 't', validate: () => ({ value: '' }) } } as never,
            ],
          },
        },
      }),
    ).not.toThrow()
  })
})

describe('conflict / cycle errors name the reactions', () => {
  it('a conflict lists both writers with their call site, reads and writes', () => {
    let error: unknown
    try {
      createEngine<{ a: number; b: number }>({
        initialValues: { a: 1, b: 0 },
        effects: [
          defineEffects<{ a: number; b: number }>(({ reaction }) => {
            reaction((d) => { d.b.$value = d.a.$value })
            reaction((d) => { d.b.$value = 2 })
          }),
        ],
      })
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(ShikiConflictError)
    const message = (error as Error).message
    expect(message).toContain('d.b.$value is written by two reactions')
    expect(message).toMatch(/1\. reaction:\d+ at tests\/dev-errors\.test\.tsx:\d+:\d+: reads d\.a\.\$value; writes d\.b\.\$value/)
    expect(message).toMatch(/2\. reaction:\d+ at tests\/dev-errors\.test\.tsx:\d+:\d+: reads nothing; writes d\.b\.\$value/)
    expect(message).toContain('watch')
    expect((error as ShikiConflictError).state).toBe('b:value')
  })

  it('a cycle lists each reaction in the loop with what it reads and writes', () => {
    let error: unknown
    try {
      createEngine<{ a: number; b: number }>({
        initialValues: { a: 1, b: 0 },
        effects: [
          defineEffects<{ a: number; b: number }>(({ reaction }) => {
            reaction((d) => { d.b.$value = d.a.$value + 1 })
            reaction((d) => { d.a.$value = d.b.$value + 1 })
          }),
        ],
      })
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(ShikiCycleError)
    const message = (error as Error).message
    expect(message).toMatch(/reaction:\d+ at tests\/dev-errors\.test\.tsx:\d+:\d+: reads d\.a\.\$value; writes d\.b\.\$value/)
    expect(message).toMatch(/reaction:\d+ at tests\/dev-errors\.test\.tsx:\d+:\d+: reads d\.b\.\$value; writes d\.a\.\$value/)
    expect((error as ShikiCycleError).cycle.length).toBeGreaterThan(0)
  })

  it('a reaction.each instance names its row', () => {
    let error: unknown
    try {
      createEngine<{ rows: { a: number; b: number }[] }>({
        initialValues: { rows: [{ a: 1, b: 0 }] },
        effects: [
          defineEffects<{ rows: { a: number; b: number }[] }>(({ reaction }) => {
            reaction.each((d) => d.rows, (row) => { row.b.$value = row.a.$value })
            reaction((d) => { d.rows[0].b.$value = 5 })
          }),
        ],
      })
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(ShikiConflictError)
    expect((error as Error).message).toMatch(/reaction\.each:\d+ \[row 0\] at tests\/dev-errors\.test\.tsx:\d+:\d+: reads d\.rows\[0\]\.a\.\$value/)
  })
})

describe('useForm() / createForm() with no arguments', () => {
  it('returns a form, and switching arguments does not change the hook count', () => {
    expect(typeof createForm().getValue).toBe('function')
    expect(typeof createForm(undefined).submit).toBe('function')
    expect(createForm().getValue('missing')).toBeUndefined()

    const bare = renderHook(({ none }: { none: boolean }) => (none ? useForm() : useForm(undefined)), {
      initialProps: { none: false },
    })
    expect(typeof bare.result.current.getValue).toBe('function')
    bare.rerender({ none: true })
    expect(typeof bare.result.current.getValue).toBe('function')
    bare.rerender({ none: false })
    bare.unmount()

    const switched = renderHook(
      ({ opts }: { opts?: { initialValues: { a: string } } }) => useForm(opts),
      { initialProps: { opts: undefined as { initialValues: { a: string } } | undefined } },
    )
    switched.rerender({ opts: {} as { initialValues: { a: string } } })
    switched.rerender({ opts: { initialValues: { a: '' } } })
    switched.rerender({ opts: undefined })
    expect(switched.result.current.getValue('a')).toBeUndefined()
    switched.unmount()

    const typedForm = renderHook(() => typed<{ a: string }>().useForm({ initialValues: { a: 'x' } }))
    expect(typedForm.result.current.getValue('a')).toBe('x')
    typedForm.unmount()

    const external = createForm({ initialValues: { q: '' } })
    const query = renderHook(
      ({ pass }: { pass: boolean }) =>
        useQueryTable({
          form: pass ? external : undefined,
          initialValues: { q: '' },
          request: async () => ({ data: [], total: 0 }),
        }),
      { initialProps: { pass: false } },
    )
    expect(typeof query.result.current.form.getValue).toBe('function')
    query.rerender({ pass: true })
    expect(query.result.current.form).toBe(external)
    query.rerender({ pass: false })
    expect(query.result.current.form).not.toBe(external)
    query.unmount()
  })
})
