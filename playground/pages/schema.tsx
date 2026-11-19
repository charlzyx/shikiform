import { localize } from '../language'
import { useState } from 'react'
import { z } from 'zod'
import * as v from 'valibot'
import { Form, ObjectField, typed, useForm, type FieldError } from '@shikiform/react'
import { Button, FormButtonGroup, FormItem, FormLayout, Input, Space } from '../kit'

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
    nick: v.pipe(v.string(), v.minLength(1, localize("昵称必填", "Nickname is required"))),
    ghost: v.pipe(v.string(), v.minLength(1, localize("幽灵必填", "The auxiliary field is required"))),
    address: v.object({ city: v.pipe(v.string(), v.minLength(1, localize("城市必填", "City is required"))), street: v.string() }),
    items: v.array(v.object({ name: v.pipe(v.string(), v.minLength(1, localize("名称必填", "Name is required"))) })),
  }),
  v.forward(
    v.partialCheck([['password'], ['confirm']], (input) => input.password === input.confirm, localize("两次密码不一致", "Passwords do not match")),
    ['confirm'],
  ),
)

/** A reusable fragment is a plain component: names are relative to the surrounding `<ObjectField>`. */
const A = typed<Address>()
function AddressFields() {
  return (
    <>
      <A.Field name="city" title={localize("城市", "City")} decorator={[FormItem]} component={[Input, { 'data-testid': 'city' }]} />
      <A.Field name="street" title={localize("街道", "Street")} decorator={[FormItem]} component={[Input, { 'data-testid': 'street' }]} />
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
    <main>
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
        <h1>{localize("Standard Schema 校验", "Standard Schema validation")}</h1>
        <p>
          {localize("字段规则用 Zod 和内置规则；整表交给一个 Valibot schema，issue 的 path 落到对应字段（两次密码、商品名称）。\n          「隐藏昵称」是", "Zod and built-in rules validate individual fields. A Valibot schema maps whole-form errors to the matching field. Hide nickname sets")} <code>visible: false</code>{localize("：不显示、不校验，值照常提交；「丢弃幽灵」是", ", hiding it and skipping validation while retaining its value. Drop auxiliary field uses")} <code>visible: false</code> {localize("加", "and")} <code>omit</code>{localize("：不校验、不提交。", " to skip validation and submission.")}
        </p>
        <FormLayout style={{ maxWidth: 560 }}>
          <F.Field name="email" title={localize("邮箱", "Email")} rules={[z.string().email(localize("邮箱格式不对", "Invalid email address")), { minLength: 3, message: localize("太短", "Too short") }]}
            decorator={[FormItem]} component={[Input, { 'data-testid': 'email' }]} />
          <F.Field name="password" title={localize("密码", "Password")} decorator={[FormItem]} component={[Input.Password, { 'data-testid': 'password' }]} />
          <F.Field name="confirm" title={localize("确认密码", "Confirm password")} decorator={[FormItem]} component={[Input.Password, { 'data-testid': 'confirm' }]} />
          <F.Field name="nick" title={localize("昵称", "Nickname")} decorator={[FormItem]} component={[Input, { 'data-testid': 'nick' }]} />
          <F.Field name="ghost" title={localize("幽灵字段", "Auxiliary field")} description={localize("丢弃后不校验、不提交", "Excluded from validation and submission when dropped")} decorator={[FormItem]} component={[Input, { 'data-testid': 'ghost' }]} />
          <ObjectField name="address">
            <AddressFields />
          </ObjectField>
          <F.ArrayField name="items">
            {(row) => <row.Field name="name" title={localize("商品名称", "Product name")} decorator={[FormItem]} component={[Input, { 'data-testid': 'item-name' }]} />}
          </F.ArrayField>
          <FormButtonGroup>
            <Space wrap>
              <Button data-testid="hide-nick" onClick={() => showNick(false)}>{localize("隐藏昵称", "Hide nickname")}</Button>
              <Button data-testid="show-nick" onClick={() => showNick(true)}>{localize("显示昵称", "Show nickname")}</Button>
              <Button data-testid="drop-ghost" onClick={dropGhost}>{localize("丢弃幽灵", "Drop auxiliary field")}</Button>
              {/* Not <Submit />: it is disabled while errors are shown, and this page submits again with errors on purpose. */}
              <Button variant="primary" htmlType="submit" data-testid="schema-submit">{localize("提交", "Submit")}</Button>
            </Space>
          </FormButtonGroup>
        </FormLayout>
        <p>{localize("错误", "Errors")}</p>
        <pre data-testid="errors">{errors}</pre>
        <p>{localize("提交值", "Submitted values")}</p>
        <pre data-testid="result">{result}</pre>
      </Form>
    </main>
  )
}
