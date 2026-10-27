import { useState } from 'react'
import { z } from 'zod'
import * as v from 'valibot'
import { withAntdFieldGroup, useAntdForm } from 'shikiform/antd'
import { Field } from 'shikiform'

interface Address {
  city: string
  street: string
}

interface Values {
  email: string
  password: string
  confirm: string
  nick: string
  ghost: string
  address: Address
  items: { name: string }[]
}

const crossField = v.pipe(
  v.object({
    email: v.string(),
    password: v.string(),
    confirm: v.string(),
    nick: v.pipe(v.string(), v.minLength(1, '昵称必填')),
    ghost: v.pipe(v.string(), v.minLength(1, '幽灵必填')),
    address: v.object({ city: v.pipe(v.string(), v.minLength(1, '城市必填')), street: v.string() }),
    items: v.array(v.object({ name: v.pipe(v.string(), v.minLength(1, '名称必填')) })),
  }),
  v.forward(
    v.partialCheck([['password'], ['confirm']], (input) => input.password === input.confirm, '两次密码不一致'),
    ['confirm'],
  ),
)

const AddressFields = withAntdFieldGroup<Address>({
  render: ({ group }) => (
    <>
      <group.AppField name="city">{(field) => <field.Input data-testid="city" placeholder="城市" />}</group.AppField>
      <group.AppField name="street">{(field) => <field.Input data-testid="street" placeholder="街道" />}</group.AppField>
    </>
  ),
})

export function SchemaPage() {
  const form = useAntdForm<Values>({
    initialValues: {
      email: '',
      password: '',
      confirm: '',
      nick: '',
      ghost: '',
      address: { city: '', street: '' },
      items: [{ name: '' }],
    },
    validate: crossField,
  })
  const [result, setResult] = useState('')
  const [errors, setErrors] = useState('')
  return (
    <form.AppForm>
      <Field name="email" rules={[z.string().email('邮箱格式不对'), { minLength: 3, message: '太短' }]}>
        {(field) => (
          <label>
            <input
              data-testid="email"
              placeholder="邮箱"
              value={field.value ?? ''}
              onChange={(event) => field.onChange(event.target.value)}
              onBlur={field.onBlur}
            />
            <span>{field.errors[0]}</span>
          </label>
        )}
      </Field>
      <Field name="password">
        {(field) => (
          <input data-testid="password" value={field.value ?? ''} onChange={(event) => field.onChange(event.target.value)} />
        )}
      </Field>
      <Field name="confirm">
        {(field) => (
          <input data-testid="confirm" value={field.value ?? ''} onChange={(event) => field.onChange(event.target.value)} />
        )}
      </Field>
      <Field name="nick">
        {(field) => (
          <input data-testid="nick" value={field.value ?? ''} onChange={(event) => field.onChange(event.target.value)} />
        )}
      </Field>
      <Field name="ghost">
        {(field) => (
          <input data-testid="ghost" value={field.value ?? ''} onChange={(event) => field.onChange(event.target.value)} />
        )}
      </Field>
      <AddressFields name="address" />
      <Field name="items.0.name">
        {(field) => (
          <input data-testid="item-name" value={field.value ?? ''} onChange={(event) => field.onChange(event.target.value)} />
        )}
      </Field>
      <button
        type="button"
        data-testid="hide-nick"
        onClick={() =>
          form.batch((d) => {
            d.nick.$display = 'hidden'
          })
        }
      >
        隐藏昵称
      </button>
      <button
        type="button"
        data-testid="show-nick"
        onClick={() =>
          form.batch((d) => {
            d.nick.$display = 'visible'
          })
        }
      >
        显示昵称
      </button>
      <button
        type="button"
        data-testid="drop-ghost"
        onClick={() =>
          form.batch((d) => {
            d.ghost.$display = 'none'
          })
        }
      >
        丢弃幽灵
      </button>
      <form.Submit
        data-testid="schema-submit"
        htmlType="button"
        disabled={false}
        onClick={async (event) => {
          event.preventDefault()
          const submitted = await form.submit()
          setErrors(form.errors.map((error) => `${error.path}:${error.messages.join(',')}`).join('\n'))
          if (submitted.ok) setResult(JSON.stringify(submitted.values))
          else setResult('')
        }}
      >
        提交
      </form.Submit>
      <pre data-testid="errors">{errors}</pre>
      <pre data-testid="result">{result}</pre>
    </form.AppForm>
  )
}
