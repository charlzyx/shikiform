import { MergedTable } from 'shikiform/antd'
import { Field, Form, useForm, useFormContext, useWatch, type Draft } from 'shikiform'

interface Product {
  id: string
  name: string
  price: number
  active: boolean
}

interface Supplier {
  id: string
  name: string
  level: 'A' | 'B' | 'C'
  products: Product[]
}

interface Values {
  onlyActive: boolean
  suppliers: Supplier[]
}

const INITIAL: Supplier[] = [
  {
    id: 'sA',
    name: '供应商A',
    level: 'C',
    products: [
      { id: 'p1', name: '螺丝', price: 10, active: true },
      { id: 'p2', name: '螺母', price: 20, active: false },
    ],
  },
  {
    id: 'sB',
    name: '供应商B',
    level: 'A',
    products: [{ id: 'p3', name: '垫片', price: 5, active: true }],
  },
]

interface FlatRow {
  id: string
  supplierIndex: number
  productIndex: number
  supplierId: string
  lead: boolean
}

export function MergedPage() {
  const form = useForm<Values>({
    initialValues: { onlyActive: false, suppliers: INITIAL },
    fields: { onlyActive: { virtual: true } },
  })
  return (
    <Form form={form}>
      <MergedBody />
    </Form>
  )
}

function MergedBody() {
  const form = useFormContext<Values>()
  const onlyActive = useWatch((d: Draft<Values>) => d.onlyActive.$value) === true
  const suppliers = useWatch((d: Draft<Values>) => d.suppliers.$value) ?? []
  const rows: FlatRow[] = []
  suppliers.forEach((supplier, supplierIndex) => {
    let lead = true
    supplier.products.forEach((product, productIndex) => {
      if (onlyActive && !product.active) return
      rows.push({ id: product.id, supplierIndex, productIndex, supplierId: supplier.id, lead })
      lead = false
    })
  })
  return (
    <main>
      <h1>供应商和产品</h1>
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
      <pre data-testid="names">{suppliers.map((supplier) => supplier.name).join(',')}</pre>
      <MergedTable
        rows={rows}
        groupOf={(row) => row.supplierId}
        columns={[
          {
            title: '供应商',
            key: 'supplier',
            merge: true,
            render: (row) =>
              row.lead ? <SupplierCell supplierIndex={row.supplierIndex} productId={row.id} /> : null,
          },
          {
            title: '产品',
            key: 'name',
            render: (row) => (
              <Field name={`suppliers.${row.supplierIndex}.products.${row.productIndex}.name`}>
                {(field) => <span data-testid={`name-${row.id}`}>{field.value}</span>}
              </Field>
            ),
          },
          {
            title: '价格',
            key: 'price',
            render: (row) => (
              <Field
                name={`suppliers.${row.supplierIndex}.products.${row.productIndex}.price`}
                rules={[
                  {
                    validator: (value, ctx) =>
                      ctx.parent?.level === 'C' && Number(value) > 1000 ? 'C 级供应商单价不能超过 1000' : null,
                  },
                ]}
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
            ),
          },
          {
            title: '在售',
            key: 'active',
            render: (row) => (
              <Field name={`suppliers.${row.supplierIndex}.products.${row.productIndex}.active`}>
                {(field) => (
                  <input
                    data-testid={`active-${row.id}`}
                    type="checkbox"
                    checked={!!field.value}
                    onChange={(event) => field.onChange(event.target.checked)}
                  />
                )}
              </Field>
            ),
          },
        ]}
      />
      <button
        type="button"
        data-testid="add-supplier"
        onClick={() =>
          form.pushArray('suppliers', { id: `s${suppliers.length + 1}`, name: '', level: 'B', products: [] })
        }
      >
        加供应商
      </button>
    </main>
  )
}

function SupplierCell({ supplierIndex, productId }: { supplierIndex: number; productId: string }) {
  const form = useFormContext<Values>()
  const suppliers = useWatch((d: Draft<Values>) => d.suppliers.$value) ?? []
  const supplier = suppliers[supplierIndex]
  if (!supplier) return null
  return (
    <div>
      <Field
        name={`suppliers.${supplierIndex}.name`}
        rules={[
          { required: true, message: '供应商必填' },
          {
            validator: (value, ctx) => {
              const names = (ctx.array ?? [])
                .map((item: { name?: string }) => item?.name)
                .filter((name) => name && name === value)
              return names.length > 1 ? '供应商重名' : null
            },
          },
        ]}
      >
        {(field) => (
          <span>
            <input
              data-testid={`supplier-${productId}`}
              value={field.value ?? ''}
              onChange={(event) => field.onChange(event.target.value)}
              onBlur={field.onBlur}
            />
            <span data-testid={`supplier-error-${supplier.id}`}>{field.errors[0] ?? ''}</span>
          </span>
        )}
      </Field>
      <Field name={`suppliers.${supplierIndex}.level`}>
        {(field) => (
          <select
            data-testid={`level-${supplier.id}`}
            value={field.value ?? 'B'}
            onChange={(event) => field.onChange(event.target.value as Supplier['level'])}
          >
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
          </select>
        )}
      </Field>
      <button
        type="button"
        data-testid={`up-${supplier.id}`}
        disabled={supplierIndex === 0}
        onClick={() => form.moveArray('suppliers', supplierIndex, supplierIndex - 1)}
      >
        组上移
      </button>
      <button
        type="button"
        data-testid={`add-product-${supplier.id}`}
        onClick={() =>
          form.pushArray(`suppliers.${supplierIndex}.products` as 'suppliers.0.products', {
            id: 'p-new',
            name: '新产品',
            price: 1,
            active: true,
          })
        }
      >
        加产品
      </button>
    </div>
  )
}
