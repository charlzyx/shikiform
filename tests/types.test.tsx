import { expect, it } from 'vitest'
import { createForm } from '../src/core'
import { useField } from '../src/react/use-field'

const form = createForm<{ name: string; items: { price: number }[] }>({})
form.getValue('name')
form.getValue('items.0.price')
// @ts-expect-error name is not on the form value
form.getValue('nope')

function Probe() {
  const price = useField<{ price: number; title: string }>('price')
  // @ts-expect-error missing key
  useField<{ price: number }>('nope')
  return price.value
}

it('checks paths at compile time', () => {
  expect(form.getValue('items.0.price')).toBeUndefined()
  expect(typeof Probe).toBe('function')
})
