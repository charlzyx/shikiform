import { useEffect, useRef, useState } from 'react'
import { defineEffects, Field, Form, ObjectField, useForm, useWatch, type Draft } from '@shikiform/react'
import type { Display } from '@shikiform/core'
import { Button } from 'antd'
import { FormButtonGroup, FormItem, FormLayout, Input, Radio } from '@shikiform/antd'
import { tid } from '../testid'

interface Values {
  mode: Display
  box: { email: string }
}

const MODES = [
  { label: '显示 visible', value: 'visible' },
  { label: '隐藏 hidden', value: 'hidden' },
  { label: '不提交 virtual', value: 'virtual' },
  { label: '不参与 none', value: 'none' },
]

const effects = defineEffects<Values>(({ reaction }) => {
  reaction((d) => {
    d.box.$display = d.mode.$value
  })
})

function ClearOnMode({ clear }: { clear: () => void }) {
  const mode = useWatch((d: Draft<Values>) => d.mode.$value)
  const clearRef = useRef(clear)
  clearRef.current = clear
  const ready = useRef(false)
  useEffect(() => {
    if (!ready.current) {
      ready.current = true
      return
    }
    clearRef.current()
  }, [mode])
  return null
}

/** `hidden` keeps and validates. `virtual` renders and validates but drops the subtree. `none` skips validation and drops submit; the value stays. The child follows the parent. */
export function DisplayPage() {
  const form = useForm<Values>({
    initialValues: { mode: 'visible', box: { email: 'a@b.co' } },
    fields: {
      mode: { display: 'virtual' },
      'box.email': { rules: [{ required: true, message: '邮箱必填' }] },
    },
    effects: [effects],
  })
  const [payload, setPayload] = useState('')
  const [errors, setErrors] = useState('')
  return (
    <Form
      form={form}
      onSubmit={(values) => {
        setPayload(JSON.stringify(values))
        setErrors('')
      }}
      onInvalid={(failed) => {
        setPayload('')
        setErrors(failed.flatMap((error) => error.messages).join(' '))
      }}
    >
      <ClearOnMode clear={() => { setPayload(''); setErrors('') }} />
      <h1>显隐</h1>
      <p>
        reaction 写 <code>d.box.$display</code>，里面的邮箱跟着父级。<b>hidden</b>：不渲染，值保留、照样校验和提交；
        <b>virtual</b>：仍渲染、仍校验，整棵子树不提交；
        <b>none</b>：不渲染、不校验、不提交（值还在，切回显示时回来）。清空邮箱再切到「隐藏」提交，会看到「邮箱必填」。
      </p>
      <FormLayout labelCol={{ span: 4 }} wrapperCol={{ span: 14 }}>
        <Field name="mode" title="box 的 display" enum={MODES} decorator={[FormItem]} component={[Radio, { optionType: 'button' }]} />
        <ObjectField name="box">
          <Field name="email" title="邮箱" decorator={[FormItem]} component={[Input, tid('email')]} />
        </ObjectField>
        <FormButtonGroup.FormItem>
          {/* A plain submit button: <Submit /> would stay disabled while the hidden field has an error. */}
          <Button type="primary" htmlType="submit" data-testid="submit">提交</Button>
        </FormButtonGroup.FormItem>
      </FormLayout>
      <p>错误：<span data-testid="errors">{errors}</span></p>
      <p>提交值：<code data-testid="payload">{payload}</code></p>
    </Form>
  )
}
