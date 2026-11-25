import { ArrayField, createForm, defineEffects, Form, ShikiUsageError, useArrayField } from '@shikiform/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllEnvs())

it('updates a nested reaction when its object becomes a scalar and then an object again', () => {
  type Values = { contact: { name: string } | string; summary: string }
  const form = createForm<Values>({
    initialValues: { contact: { name: 'Ada' }, summary: '' },
    effects: [defineEffects<Values>(({ reaction }) => {
      reaction((d) => { d.summary.$value = d.contact.name.$value ?? 'no contact' })
    })],
  })
  expect(form.getValue('summary')).toBe('Ada')

  form.setValue('contact', 'unavailable')
  expect(form.getValue('summary')).toBe('no contact')
  form.setValue('contact', { name: 'Lin' })
  expect(form.getSubmitValues()).toEqual({ contact: { name: 'Lin' }, summary: 'Lin' })
})

describe.each(['development', 'production'] as const)('array value shapes in %s', (mode) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', mode))

  it.each([null, undefined])('pushes into a nullish slot (%s) without losing its item template', async (empty) => {
    type Values = { rows?: { name: string }[] | null }
    const form = createForm<Values>({
      initialValues: { rows: empty },
      fields: { 'rows.*.name': { required: true } },
    })
    let push!: ReturnType<typeof useArrayField>['push']
    function CapturePush() {
      push = useArrayField('rows').push
      return null
    }
    renderToString(<Form form={form}><CapturePush /></Form>)

    push({ name: 'original' })
    expect(form.getSubmitValues()).toEqual({ rows: [{ name: 'original' }] })
    form.setValue('rows', empty)
    push({ name: '' })

    await expect(form.submit()).rejects.toEqual([expect.objectContaining({ path: 'rows.0.name' })])
    form.setValue('rows.0.name', 'new')
    await expect(form.submit()).resolves.toEqual({ rows: [{ name: 'new' }] })
  })

  it('handles an ArrayField mounted over an object without changing the stored value', () => {
    expectNonArrayMount({ saved: 'retain' }, mode)
  })

  it('QA-42 protects non-array data from previously captured array actions', () => {
    const original = { saved: 'retain this record' }
    const form = createForm<{ rows: string[] | typeof original }>({ initialValues: { rows: ['initial'] } })
    let actions!: ReturnType<typeof useArrayField>
    function CaptureActions() {
      actions = useArrayField('rows')
      return null
    }
    renderToString(<Form form={form}><CaptureActions /></Form>)
    form.setValue('rows', original)

    const edits = [
      () => actions.push('new row'), () => actions.insert(0, 'new row'), () => actions.remove(0),
      () => actions.move(0, 1), () => actions.swap(0, 1), () => actions.replace(0, 'new row'),
    ]
    for (const edit of edits) {
      if (mode === 'development') {
        expect.soft(edit).toThrow(ShikiUsageError)
        expect.soft(edit).toThrow(/rows.*array/i)
      } else {
        expect.soft(edit).not.toThrow()
      }
      expect(form.getSubmitValues()).toEqual({ rows: original })
    }
  })
})

it.fails('BUG: QA-43 gives actionable ArrayField guidance for a BigInt in development', () => {
  vi.stubEnv('NODE_ENV', 'development')
  expectNonArrayMount(9n, 'development')
})

it('preserves a BigInt when an ArrayField is mounted over it in production', () => {
  vi.stubEnv('NODE_ENV', 'production')
  expectNonArrayMount(9n, 'production')
})

function expectNonArrayMount(value: unknown, mode: 'development' | 'production') {
  const form = createForm({ initialValues: { rows: value } })
  const renderRows = vi.fn(() => null)
  const renderArray = () => renderToString(<Form form={form}><ArrayField name="rows">{renderRows}</ArrayField></Form>)

  if (mode === 'development') {
    expect.soft(renderArray).toThrow(ShikiUsageError)
    expect.soft(renderArray).toThrow(/rows: \[\].*<Field> \/ <ObjectField>/)
  } else {
    expect.soft(renderArray).not.toThrow()
  }
  expect.soft(renderRows).not.toHaveBeenCalled()
  expect(form.getSubmitValues()).toEqual({ rows: value })
}
