import { localize } from '../language'
import { ArrayField, Field, Form, useForm } from '@shikiform/react'

interface Row {
  id: string
  name: string
}

export function VirtualPage() {
  const rows: Row[] = Array.from({ length: 40 }, (_, index) => ({ id: `v${index}`, name: `row-${index}` }))
  const form = useForm<{ rows: Row[] }>({ initialValues: { rows } })
  return (
    <Form form={form}>
      <h1>{localize("虚拟滚动", "Virtual scrolling")}</h1>
      <p>{localize("40 行，只挂载可见的几行（", "Only the visible window of 40 rows is mounted (")}<code>virtualScroll</code>{localize("）；滚动时行组件复用，值和状态按行身份走。", "). Scrolling reuses row components while values and state follow row identity.")}</p>
      <ArrayField name="rows" virtualScroll={{ height: 200, rowHeight: 40, overscan: 2 }}>
        {({ index }) => (
          <div data-testid={`virtual-row-${index}`}>
            <Field name="name">{(field) => <span>{field.value}</span>}</Field>
          </div>
        )}
      </ArrayField>
    </Form>
  )
}
