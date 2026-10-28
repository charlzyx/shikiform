import { useState } from 'react'
import { defineEffects, Field, Form, useForm } from 'shikiform'
import type { Display } from 'shikiform/core'

interface Values {
  mode: Display
  box: { email: string }
}

const effects = defineEffects<Values>(({ reaction }) => {
  reaction((d) => {
    d.box.$display = d.mode.$value
  })
})

/** `hidden` keeps and validates. `none` drops the value and skips validation. The child follows the parent. */
export function DisplayPage() {
  const form = useForm<Values>({
    initialValues: { mode: 'visible', box: { email: 'a@b.co' } },
    fields: {
      mode: { virtual: true },
      'box.email': { rules: [{ required: true, message: '邮箱必填' }] },
    },
    effects: [effects],
  })
  const [payload, setPayload] = useState('')
  const [errors, setErrors] = useState('')
  return (
    <Form form={form}>
      <h1>显隐</h1>
      <div>
        <button type="button" data-testid="mode-visible" onClick={() => form.setValue('mode', 'visible')}>
          显示
        </button>
        <button type="button" data-testid="mode-hidden" onClick={() => form.setValue('mode', 'hidden')}>
          隐藏
        </button>
        <button type="button" data-testid="mode-none" onClick={() => form.setValue('mode', 'none')}>
          不提交
        </button>
      </div>
      <Field name="box.email">
        {(field) => (
          <input
            data-testid="email"
            value={field.value ?? ''}
            onChange={(event) => field.onChange(event.target.value)}
            onBlur={field.onBlur}
          />
        )}
      </Field>
      <button
        type="button"
        data-testid="submit"
        onClick={() => {
          void form.submit().then((result) => {
            if (result.ok) {
              setPayload(JSON.stringify(result.values))
              setErrors('')
            } else {
              setPayload('')
              setErrors(result.errors.flatMap((error) => error.messages).join(' '))
            }
          })
        }}
      >
        提交
      </button>
      <p data-testid="errors">{errors}</p>
      <pre data-testid="payload">{payload}</pre>
    </Form>
  )
}
