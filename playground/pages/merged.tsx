import { Button, Space } from 'antd'
import { Field, Form, useArray, useForm, useWatch, type Draft } from '@shikiform/react'
import { Checkbox, FormItem, Input, InputNumber, MergedTable, Select, Switch } from '@shikiform/antd'
import { newProduct, newSupplier, supplierRows, type FlatRow, type Supplier } from '../merged-model'
import { tid } from '../testid'

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

const LEVELS = ['A', 'B', 'C'].map((value) => ({ label: `${value} 级`, value }))
/** A table cell: no label, errors right under the control. */
const cell = [FormItem, { style: { margin: 0 } }] as const

/**
 * Values stay nested (`suppliers.N.products.M`); the table is a flat display model from `supplierRows`. A row only
 * records the path coordinates, so every cell writes its real path. `MergedTable` is not an array field: the cell
 * names are full paths built from those coordinates.
 */
export function MergedPage() {
  const form = useForm<Values>({
    initialValues: { onlyActive: false, suppliers: INITIAL },
    fields: { onlyActive: { display: 'virtual' } },
  })
  return (
    <Form form={form}>
      <MergedBody />
    </Form>
  )
}

function MergedBody() {
  const suppliersHandle = useArray<Values, 'suppliers'>('suppliers')
  const onlyActive = useWatch((d: Draft<Values>) => d.onlyActive.$value) === true
  const suppliers = useWatch((d: Draft<Values>) => d.suppliers.$value) ?? []
  const rows = supplierRows(suppliers, onlyActive)
  return (
    <main>
      <h1>供应商和产品</h1>
      <p>
        按供应商合并单元格。C 级供应商的产品单价不能超过 1000，供应商不能重名。没有产品（或筛选后没有在售产品）的供应商仍保留一行，用来改名、加产品；这一行不创建产品。
      </p>
      <Field name="onlyActive" title="只看在售" decorator={[FormItem]} component={[Switch, tid('only-active')]} />
      <p>
        供应商顺序：<span data-testid="names">{suppliers.map((supplier) => supplier.name).join(',')}</span>
      </p>
      <MergedTable
        rows={rows}
        groupOf={(row) => row.supplierId}
        rowKey={mergedRowKey}
        columns={[
          {
            title: '供应商',
            key: 'supplier',
            merge: true,
            render: (row) => (row.lead ? <SupplierCell supplierIndex={row.supplierIndex} rowId={row.id} /> : null),
          },
          {
            title: '产品',
            key: 'name',
            render: (row) =>
              row.productIndex === null ? (
                <span data-testid={`empty-supplier-${row.supplierId}`}>
                  {suppliers[row.supplierIndex]!.products.length ? '没有在售产品' : '暂无产品'}
                </span>
              ) : (
                <span data-testid={`name-${row.id}`}>
                  <Field name={`suppliers.${row.supplierIndex}.products.${row.productIndex}.name`} pattern="readPretty" component={[Input]} />
                </span>
              ),
          },
          {
            title: '单价',
            key: 'price',
            render: (row) =>
              row.productIndex === null ? null : (
                <div data-testid={`price-error-${row.id}`}>
                  <Field
                    name={`suppliers.${row.supplierIndex}.products.${row.productIndex}.price`}
                    decorator={cell}
                    component={[InputNumber, tid(`price-${row.id}`)]}
                    rules={{ validator: (value, ctx) => (ctx.parent?.level === 'C' && Number(value) > 1000 ? 'C 级供应商单价不能超过 1000' : null) }}
                  />
                </div>
              ),
          },
          {
            title: '在售',
            key: 'active',
            render: (row) =>
              row.productIndex === null ? null : (
                <Field name={`suppliers.${row.supplierIndex}.products.${row.productIndex}.active`} component={[Checkbox, tid(`active-${row.id}`)]} />
              ),
          },
        ]}
      />
      <Button style={{ marginTop: 8 }} data-testid="add-supplier" onClick={() => suppliersHandle.push(newSupplier())}>
        加供应商
      </Button>
    </main>
  )
}

/** The lead row's id changes when a placeholder is replaced by the first product. The supplier field must not. */
function mergedRowKey(row: FlatRow) {
  return row.lead ? `lead:${row.supplierId}` : row.id
}

function SupplierCell({ supplierIndex, rowId }: { supplierIndex: number; rowId: string }) {
  const suppliersHandle = useArray<Values, 'suppliers'>('suppliers')
  const products = useArray(`suppliers.${supplierIndex}.products`)
  const supplier = useWatch((d: Draft<Values>) => d.suppliers.$value)?.[supplierIndex]
  if (!supplier) return null
  return (
    <Space direction="vertical" data-testid={`supplier-cell-${supplier.id}`}>
      <div data-testid={`supplier-error-${supplier.id}`}>
        <Field
          name={`suppliers.${supplierIndex}.name`}
          decorator={cell}
          component={[Input, { ...tid(`supplier-${rowId}`), 'aria-label': '供应商名称', placeholder: '供应商名称' }]}
          rules={[
            { required: true, message: '供应商必填' },
            {
              validator: (value, ctx) =>
                (ctx.array ?? []).filter((item: { name?: string }) => item?.name && item.name === value).length > 1 ? '供应商重名' : null,
            },
          ]}
        />
      </div>
      <Field name={`suppliers.${supplierIndex}.level`} enum={LEVELS} component={[Select, { ...tid(`level-${supplier.id}`), style: { width: 90 } }]} />
      <Space>
        <Button size="small" data-testid={`up-${supplier.id}`} disabled={supplierIndex === 0} onClick={() => suppliersHandle.move(supplierIndex, supplierIndex - 1)}>
          组上移
        </Button>
        <Button
          size="small"
          data-testid={`add-product-${supplier.id}`}
          onClick={() => products.push(newProduct())}
        >
          加产品
        </Button>
      </Space>
    </Space>
  )
}
