import { useState } from 'react'
import { z } from 'zod'
import * as v from 'valibot'
import { Button, Space } from 'antd'
import { FormButtonGroup, FormItem, FormLayout, Input } from '@shikiform/antd'
import { Form, ObjectField, typed, useForm, type FieldError } from '@shikiform/react'

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

/** A reusable fragment is a plain component: names are relative to the surrounding `<ObjectField>`. */
const A = typed<Address>()
function AddressFields() {
  return (
    <>
      <A.Field name="city" title="城市" decorator={[FormItem]} component={[Input, { 'data-testid': 'city' }]} />
      <A.Field name="street" title="街道" decorator={[FormItem]} component={[Input, { 'data-testid': 'street' }]} />
    </>
  )
}

/**
 * Field rules are Zod / built-in; the whole form is checked by one Valibot schema (`validate`), whose issue paths
 * land on fields (`confirm`, `items.0.name`). `hidden` still validates and submits; `none` does neither.
 */
export function SchemaPage() {
  const form = useForm<Values>({
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
  const F = typed(form)
  const [result, setResult] = useState('')
  const [errors, setErrors] = useState('')
  const show = (failed: readonly FieldError[]) => setErrors(failed.map((error) => `${error.path}:${error.messages.join(',')}`).join('\n'))
  const showNick = (visible: boolean) => form.batch((d) => { d.nick.$visible = visible })
  const dropGhost = () => form.batch((d) => { d.ghost.$visible = false; d.ghost.$omit = true })
  return (
    <Form
      form={form}
      onSubmit={(values) => {
        show([])
        setResult(JSON.stringify(values, null, 2))
      }}
      onInvalid={() => {
        show(form.errors)
        setResult('')
      }}
    >
      <h1>Standard Schema 校验</h1>
      <p>
        字段规则用 Zod 和内置规则；整表交给一个 Valibot schema，issue 的 path 落到对应字段（两次密码、商品名称）。
        「隐藏昵称」是 <code>visible: false</code>：不显示、不校验，值照常提交；「丢弃幽灵」是 <code>visible: false</code> 加 <code>omit</code>：不校验、不提交。
      </p>
      <FormLayout labelCol={{ span: 4 }} wrapperCol={{ span: 12 }}>
        <F.Field name="email" title="邮箱" rules={[z.string().email('邮箱格式不对'), { minLength: 3, message: '太短' }]}
          decorator={[FormItem]} component={[Input, { 'data-testid': 'email' }]} />
        <F.Field name="password" title="密码" decorator={[FormItem]} component={[Input.Password, { 'data-testid': 'password' }]} />
        <F.Field name="confirm" title="确认密码" decorator={[FormItem]} component={[Input.Password, { 'data-testid': 'confirm' }]} />
        <F.Field name="nick" title="昵称" decorator={[FormItem]} component={[Input, { 'data-testid': 'nick' }]} />
        <F.Field name="ghost" title="幽灵字段" description="丢弃后不校验、不提交" decorator={[FormItem]} component={[Input, { 'data-testid': 'ghost' }]} />
        <ObjectField name="address">
          <AddressFields />
        </ObjectField>
        <F.ArrayField name="items">
          {(row) => <row.Field name="name" title="商品名称" decorator={[FormItem]} component={[Input, { 'data-testid': 'item-name' }]} />}
        </F.ArrayField>
        <FormButtonGroup.FormItem>
          <Space wrap>
            <Button data-testid="hide-nick" onClick={() => showNick(false)}>隐藏昵称</Button>
            <Button data-testid="show-nick" onClick={() => showNick(true)}>显示昵称</Button>
            <Button data-testid="drop-ghost" onClick={dropGhost}>丢弃幽灵</Button>
            {/* Not <Submit />: it is disabled while errors are shown, and this page submits again with errors on purpose. */}
            <Button type="primary" htmlType="submit" data-testid="schema-submit">提交</Button>
          </Space>
        </FormButtonGroup.FormItem>
      </FormLayout>
      <p>错误</p>
      <pre data-testid="errors">{errors}</pre>
      <p>提交值</p>
      <pre data-testid="result">{result}</pre>
    </Form>
  )
}
