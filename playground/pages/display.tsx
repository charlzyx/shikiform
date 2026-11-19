import { localize } from '../language'
import { useEffect, useRef, useState } from 'react'
import { defineEffects, Field, Form, ObjectField, useForm, useWatch, type Draft } from '@shikiform/react'
import { Button, FormButtonGroup, FormItem, FormLayout, Input, Radio } from '../kit'
import { tid } from '../testid'

type Mode = 'visible' | 'hidden' | 'omit' | 'readOnly'

interface Values {
  mode: Mode
  box: { email: string }
}

const MODES = [
  { label: localize("显示 visible", "Visible"), value: 'visible' },
  { label: localize("隐藏 hidden", "Hidden"), value: 'hidden' },
  { label: localize("不提交 omit", "Omit"), value: 'omit' },
  { label: localize("只读 readOnly", "Read only"), value: 'readOnly' },
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

/** `hidden` does not render or validate, and still submits. `omit` renders and validates but drops the subtree (children read `$omit` as true and cannot opt back in). `readOnly` shows the preview and skips validation. The child follows visible / readOnly / omit. */
export function DisplayPage() {
  const form = useForm<Values>({
    initialValues: { mode: 'visible', box: { email: 'a@b.co' } },
    fields: {
      mode: { omit: true },
      'box.email': { rules: [{ required: true, message: localize("邮箱必填", "Email is required") }] },
    },
    effects: [effects],
  })
  const [payload, setPayload] = useState('')
  const [errors, setErrors] = useState('')
  return (
    <main>
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
        <h1>{localize("显隐", "Field visibility")}</h1>
        <p>
          {localize("reaction 写", "A reaction sets")} <code>d.box</code> {localize("的四个开关，里面的邮箱跟着", "on the parent. The email field inherits")} <code>visible</code> / <code>readOnly</code> / <code>omit</code>{localize("（父级", ". When the parent sets")} <code>omit</code> {localize("时子字段读到的也是 true，不能用", ", the child also reads true. Setting")} <code>omit: false</code> {localize("单独提交）。", "on the child cannot restore it.")}
          <b>hidden</b>{localize("：不渲染、不校验，值照常提交；", " hides the input and skips validation, but includes the value in submission.")}
          <b>omit</b>{localize("：仍渲染、仍校验，整棵子树不提交；", " keeps the input visible and validates it, but excludes the subtree from submission.")}
          <b>readOnly</b>{localize("：渲染预览、不校验、照常提交。清空邮箱再切到「不提交」提交，会看到「邮箱必填」。", " shows a preview, skips validation and includes the value. Clear the email and choose Omit to see the required error.")}
        </p>
        <FormLayout>
          <Field name="mode" title={localize("box 的状态", "Parent field state")} enum={MODES} decorator={[FormItem]} component={[Radio, { optionType: 'button' }]} />
          <ObjectField name="box">
            <Field name="email" title={localize("邮箱", "Email")} decorator={[FormItem]} component={[Input, tid('email')]} />
          </ObjectField>
          <FormButtonGroup>
            {/* A plain submit button: <Submit /> would stay disabled while the hidden field has an error. */}
            <Button variant="primary" htmlType="submit" data-testid="submit">{localize("提交", "Submit")}</Button>
          </FormButtonGroup>
        </FormLayout>
        <p>{localize("错误：", "Errors:")}<span data-testid="errors">{errors}</span></p>
        <p>{localize("提交值：", "Submitted values:")}<code data-testid="payload">{payload}</code></p>
      </Form>
    </main>
  )
}
