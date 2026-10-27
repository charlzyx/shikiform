import { MergedTable } from 'shikiform/antd'
import { Field, Form, useForm, useWatch, type Draft } from 'shikiform'

interface Product {
  id: string
  supplier: string
  name: string
  price: number
  active: boolean
}

interface Values {
  onlyActive: boolean
  products: Product[]
}

const INITIAL: Product[] = [
  { id: 'p1', supplier: '供应商A', name: '螺丝', price: 10, active: true },
  { id: 'p2', supplier: '供应商A', name: '螺母', price: 20, active: false },
  { id: 'p3', supplier: '供应商B', name: '垫片', price: 5, active: true },
]

export function MergedPage() {
  const form = useForm<Values>({
    initialValues: { onlyActive: false, products: INITIAL },
  })
  return (
    <Form form={form}>
      <MergedBody />
    </Form>
  )
}

function MergedBody() {
  const onlyActive = useWatch((d: Draft<Values>) => d.onlyActive.$value)
  const products = useWatch((d: Draft<Values>) => d.products.$value) ?? []
  const visible = products.filter((row) => !onlyActive || row.active)
  return (
    <>
      <Field name="onlyActive">
        {(field) => (
          <label>
            <input
              data-testid="only-active"
              type="checkbox"
              checked={!!field.value}
              onChange={(event) => field.onChange(event.target.checked)}
            />
            只看在售
          </label>
        )}
      </Field>
      <MergedTable
        rows={visible}
        groupOf={(row) => row.supplier}
        columns={[
          {
            title: '供应商',
            key: 'supplier',
            merge: true,
            render: (row) => <span data-testid={`supplier-${row.id}`}>{row.supplier}</span>,
          },
          { title: '名称', key: 'name', render: (row) => <span data-testid={`name-${row.id}`}>{row.name}</span> },
          {
            title: '价格',
            key: 'price',
            render: (row) => {
              const index = products.findIndex((item) => item.id === row.id)
              return (
                <Field
                  name={`products.${index}.price`}
                  rules={[{ validator: (value) => (Number(value) > 1000 ? '价格不能超过 1000' : null) }]}
                >
                  {(field) => (
                    <span>
                      <input
                        data-testid={`price-${row.id}`}
                        value={field.value ?? ''}
                        onChange={(event) => field.onChange(Number(event.target.value))}
                        onBlur={field.onBlur}
                      />
                      <span data-testid={`price-error-${row.id}`}>{field.errors[0] ?? ''}</span>
                    </span>
                  )}
                </Field>
              )
            },
          },
        ]}
      />
    </>
  )
}
