import { defineEffects, Field, Form, useForm, useWatch, type Draft } from 'shikiform'

interface Values {
  tab: 'base' | 'extra'
  name: string
  code: string
  ghost: string
  note: string
}

const effects = defineEffects<Values>(({ reaction }) => {
  reaction((d) => {
    const tab = d.tab.$value
    d.name.$display = tab === 'base' ? 'visible' : 'hidden'
    d.code.$display = tab === 'extra' ? 'visible' : 'hidden'
    d.ghost.$display = 'none'
  })
})

export function TabsPage() {
  const form = useForm<Values>({
    initialValues: { tab: 'base', name: '', code: '', ghost: '', note: '' },
    fields: {
      name: { required: true },
      code: { required: true },
      ghost: { required: true },
    },
    effects: [effects],
  })
  return (
    <Form
      form={form}
      onSubmit={() => {
        const node = document.getElementById('tabs-result')
        if (node) node.textContent = 'ok'
      }}
    >
      <TabBody />
      <button type="button" data-testid="tab-base" onClick={() => form.setValue('tab', 'base')}>
        基本
      </button>
      <button type="button" data-testid="tab-extra" onClick={() => form.setValue('tab', 'extra')}>
        附加
      </button>
      <ActiveFields />
      <button type="submit" data-testid="tabs-submit">
        提交
      </button>
      <ErrorLine />
      <div id="tabs-result" data-testid="tabs-result" />
    </Form>
  )
}

function ActiveFields() {
  const tab = useWatch<Values, string>((d) => d.tab.$value ?? 'base')
  return (
    <>
      {tab === 'base' ? (
        <Field name="name">
          {(field) => (
            <input data-testid="name" value={field.value ?? ''} onChange={(event) => field.onChange(event.target.value)} />
          )}
        </Field>
      ) : null}
      {tab === 'extra' ? (
        <Field name="code">
          {(field) => (
            <input data-testid="code" value={field.value ?? ''} onChange={(event) => field.onChange(event.target.value)} />
          )}
        </Field>
      ) : null}
      {tab === 'extra' ? (
        <Field name="note" required>
          {(field) => (
            <input data-testid="note" value={field.value ?? ''} onChange={(event) => field.onChange(event.target.value)} />
          )}
        </Field>
      ) : null}
    </>
  )
}

function TabBody() {
  const tab = useWatch<Values, string>((d) => d.tab.$value ?? 'base')
  return <div data-testid="current-tab">{tab}</div>
}

function ErrorLine() {
  const errors = useWatch((d: Draft<Values>) =>
    (['name', 'code', 'ghost', 'note'] as const).filter((path) => d[path].$errors.length).join(','),
  )
  return <pre data-testid="tabs-errors">{errors}</pre>
}
