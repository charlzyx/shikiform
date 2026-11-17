import { useEffect, useRef, useState } from 'react'
import { defineEffects, Field, Form, ObjectField, useForm, useWatch, type Draft } from '@shikiform/react'
import { Button } from 'antd'
import { FormButtonGroup, FormItem, FormLayout, Input, Radio } from '@shikiform/antd'
import { tid } from '../testid'

type Mode = 'visible' | 'hidden' | 'omit' | 'readOnly'

interface Values {
  mode: Mode
  box: { email: string }
}

const MODES = [
  { label: '显示 visible', value: 'visible' },
  { label: '隐藏 hidden', value: 'hidden' },
  { label: '不提交 omit', value: 'omit' },
  { label: '只读 readOnly', value: 'readOnly' },
]

const effects = defineEffects<Values>(({ reaction }) => {
  reaction((d) => {
    const mode = d.mode.$value
    d.box.$visible = mode !== 'hidden'
    d.box.$omit = mode === 'omit'
    d.box.$readOnly = mode === 'readOnly'
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

/** `hidden` does not render or validate, and still submits. `omit` renders and validates but drops the subtree. `readOnly` shows the preview and skips validation. The child follows visible / readOnly; omit does not inherit, so it is set on the object. */
export function DisplayPage() {
  const form = useForm<Values>({
    initialValues: { mode: 'visible', box: { email: 'a@b.co' } },
    fields: {
      mode: { omit: true },
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
        reaction 写 <code>d.box</code> 的四个开关，里面的邮箱跟着 <code>visible</code> / <code>readOnly</code>（<code>omit</code> 不继承，写在对象上，子树随对象一起不提交）。
        <b>hidden</b>：不渲染、不校验，值照常提交；
        <b>omit</b>：仍渲染、仍校验，整棵子树不提交；
        <b>readOnly</b>：渲染预览、不校验、照常提交。清空邮箱再切到「不提交」提交，会看到「邮箱必填」。
      </p>
      <FormLayout labelCol={{ span: 4 }} wrapperCol={{ span: 14 }}>
        <Field name="mode" title="box 的状态" enum={MODES} decorator={[FormItem]} component={[Radio, { optionType: 'button' }]} />
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
