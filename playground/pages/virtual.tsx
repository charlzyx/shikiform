import { ArrayField, Field, Form, useForm } from 'shikiform'

interface Row {
  id: string
  name: string
}

export function VirtualPage() {
  const rows: Row[] = Array.from({ length: 40 }, (_, index) => ({ id: `v${index}`, name: `row-${index}` }))
  const form = useForm<{ rows: Row[] }>({ initialValues: { rows } })
  return (
    <Form form={form}>
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
