import { localize, english } from '../language'
import { Field, Form, useArrayField, useForm, useWatch, type Draft } from '@shikiform/react'
import { Button, Checkbox, FormItem, Input, InputNumber, MergedTable, Select, Space, Switch } from '../kit'
import { newProduct, newSupplier, supplierRows, type FlatRow, type Supplier } from '../merged-model'
import { tid } from '../testid'

interface Values {
  onlyActive: boolean
  suppliers: Supplier[]
}

const INITIAL: Supplier[] = [
  {
    id: 'sA',
    name: localize("供应商A", "Supplier A"),
    level: 'C',
    products: [
      { id: 'p1', name: localize("螺丝", "Screw"), price: 10, active: true },
      { id: 'p2', name: localize("螺母", "Nut"), price: 20, active: false },
    ],
  },
  {
    id: 'sB',
    name: localize("供应商B", "Supplier B"),
    level: 'A',
    products: [{ id: 'p3', name: localize("垫片", "Washer"), price: 5, active: true }],
  },
]

const LEVELS = ['A', 'B', 'C'].map((value) => ({ label: (english ? `Grade ${value}` : `${value} 级`), value }))
/** A table cell: no label, errors right under the control. */
const cell = [FormItem, { compact: true }] as const

/**
 * Values stay nested (`suppliers.N.products.M`); the table is a flat display model from `supplierRows`. A row only
 * records the path coordinates, so every cell writes its real path. `MergedTable` is not an array field: the cell
 * names are full paths built from those coordinates.
 */
export function MergedPage() {
  const form = useForm<Values>({
    initialValues: { onlyActive: false, suppliers: INITIAL },
    fields: { onlyActive: { omit: true } },
  })
  return (
    <Form form={form}>
      <MergedBody />
    </Form>
  )
}

function MergedBody() {
  const suppliersHandle = useArrayField<Values, 'suppliers'>('suppliers')
  const onlyActive = useWatch((d: Draft<Values>) => d.onlyActive.$value) === true
  const suppliers = useWatch((d: Draft<Values>) => d.suppliers.$value) ?? []
  const rows = supplierRows(suppliers, onlyActive)
  return (
    <main>
      <h1>{localize("供应商和产品", "Suppliers and products")}</h1>
      <p>
        {localize("按供应商合并单元格。C 级供应商的产品单价不能超过 1000，供应商不能重名。没有产品（或筛选后没有在售产品）的供应商仍保留一行，用来改名、加产品；这一行不创建产品。", "Each supplier spans its product rows. Grade C prices cannot exceed 1000, and supplier names must be unique. An empty supplier keeps a placeholder row for renaming and adding products, even after filtering.")}
      </p>
      <Field name="onlyActive" title={localize("只看在售", "Active products only")} decorator={[FormItem]} component={[Switch, tid('only-active')]} />
      <p>
        {localize("供应商顺序：", "Supplier order:")}<span data-testid="names">{suppliers.map((supplier) => supplier.name).join(',')}</span>
      </p>
      <MergedTable
        rows={rows}
        groupOf={(row) => row.supplierId}
        rowKey={mergedRowKey}
        columns={[
          {
            title: localize("供应商", "Supplier"),
            key: 'supplier',
            merge: true,
            render: (row) => (row.lead ? <SupplierCell supplierIndex={row.supplierIndex} rowId={row.id} /> : null),
          },
          {
            title: localize("产品", "Product"),
            key: 'name',
            render: (row) =>
              row.productIndex === null ? (
                <span data-testid={`empty-supplier-${row.supplierId}`}>
                  {suppliers[row.supplierIndex]!.products.length ? localize("没有在售产品", "No active products") : localize("暂无产品", "No products")}
                </span>
              ) : (
                <span data-testid={`name-${row.id}`}>
                  <Field name={`suppliers.${row.supplierIndex}.products.${row.productIndex}.name`} readOnly component={[Input]} />
                </span>
              ),
          },
          {
            title: localize("单价", "Unit price"),
            key: 'price',
            render: (row) =>
              row.productIndex === null ? null : (
                <div data-testid={`price-error-${row.id}`}>
                  <Field
                    name={`suppliers.${row.supplierIndex}.products.${row.productIndex}.price`}
                    decorator={cell}
                    component={[InputNumber, tid(`price-${row.id}`)]}
                    rules={{ validator: (value, ctx) => (ctx.parent?.level === 'C' && Number(value) > 1000 ? localize("C 级供应商单价不能超过 1000", "Grade C unit prices cannot exceed 1000") : null) }}
                  />
                </div>
              ),
          },
          {
            title: localize("在售", "Active"),
            key: 'active',
            render: (row) =>
              row.productIndex === null ? null : (
                <Field name={`suppliers.${row.supplierIndex}.products.${row.productIndex}.active`} component={[Checkbox, tid(`active-${row.id}`)]} />
              ),
          },
        ]}
      />
      <Button style={{ marginTop: 10 }} data-testid="add-supplier" onClick={() => suppliersHandle.push(newSupplier())}>
        {localize("加供应商", "Add supplier")}
      </Button>
    </main>
  )
}

/** The lead row's id changes when a placeholder is replaced by the first product. The supplier field must not. */
function mergedRowKey(row: FlatRow) {
  return row.lead ? `lead:${row.supplierId}` : row.id
}

function SupplierCell({ supplierIndex, rowId }: { supplierIndex: number; rowId: string }) {
  const suppliersHandle = useArrayField<Values, 'suppliers'>('suppliers')
  const products = useArrayField(`suppliers.${supplierIndex}.products`)
  const supplier = useWatch((d: Draft<Values>) => d.suppliers.$value)?.[supplierIndex]
  if (!supplier) return null
  return (
    <Space direction="vertical" data-testid={`supplier-cell-${supplier.id}`}>
      <div data-testid={`supplier-error-${supplier.id}`}>
        <Field
          name={`suppliers.${supplierIndex}.name`}
          decorator={cell}
          component={[Input, { ...tid(`supplier-${rowId}`), 'aria-label': localize("供应商名称", "Supplier name"), placeholder: localize("供应商名称", "Supplier name") }]}
          rules={[
            { required: true, message: localize("供应商必填", "Supplier name is required") },
            {
              validator: (value, ctx) =>
                (ctx.array ?? []).filter((item: { name?: string }) => item?.name && item.name === value).length > 1 ? localize("供应商重名", "Duplicate supplier name") : null,
            },
          ]}
        />
      </div>
      <Field name={`suppliers.${supplierIndex}.level`} enum={LEVELS} component={[Select, { ...tid(`level-${supplier.id}`), style: { width: 100 } }]} />
      <Space>
        <Button size="sm" data-testid={`up-${supplier.id}`} disabled={supplierIndex === 0} onClick={() => suppliersHandle.move(supplierIndex, supplierIndex - 1)}>
          {localize("组上移", "Move group up")}
        </Button>
        <Button
          size="sm"
          data-testid={`add-product-${supplier.id}`}
          onClick={() => products.push(newProduct())}
        >
          {localize("加产品", "Add product")}
        </Button>
      </Space>
    </Space>
  )
}
