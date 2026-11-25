// @vitest-environment happy-dom
import { act, fireEvent } from '@testing-library/react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { Field, Form, useForm, useWatch } from '@shikiform/react'
import { FormItem, Input } from '../../fixtures/native-kit'

it('hydrates both auto-prefixed forms and keeps labels, controls, and stores independent', async () => {
  function Editor({ initial }: { initial: string }) {
    const form = useForm({ initialValues: { name: initial } })
    const name = useWatch(form, (draft) => draft.name.$value)
    return (
      <Form form={form}>
        <Field name="name" title="Name" decorator={FormItem} component={Input} />
        <output>{name}</output>
      </Form>
    )
  }
  const tree = <><Editor initial="Ada" /><Editor initial="Grace" /></>
  const identifierPrefix = 'qa-'
  const host = document.createElement('div')
  host.innerHTML = renderToString(tree, { identifierPrefix })
  document.body.append(host)
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const onRecoverableError = vi.fn()
  const originalInputs = [...host.querySelectorAll('input')]
  const ids = originalInputs.map((input) => input.id)
  let root: Root | undefined
  try {
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    await act(async () => {
      root = hydrateRoot(host, tree, { identifierPrefix, onRecoverableError })
    })
    const inputs = [...host.querySelectorAll('input')]
    inputs.forEach((input, index) => expect(input).toBe(originalInputs[index]))
    expect(inputs.map((input) => input.id)).toEqual(ids)
    expect([...host.querySelectorAll('label')].map((label) => label.htmlFor)).toEqual(ids)
    fireEvent.change(inputs[0]!, { target: { value: 'Ada edited' } })
    expect([...host.querySelectorAll('output')].map((output) => output.textContent)).toEqual(['Ada edited', 'Grace'])
    expect(onRecoverableError).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  } finally {
    if (root) act(() => root!.unmount())
    host.remove()
    error.mockRestore()
  }
})
