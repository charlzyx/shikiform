import { useState } from 'react'
import { ArrayField, defineEffects, Field, Form, useForm } from 'shikiform'
import { ArrayTable, Checkbox, FormButtonGroup, FormItem, FormLayout, InputNumber, Submit, type ArrayTableColumn } from 'shikiform/antd'
import { CATALOG, comboId } from '../data'

interface SkuRow {
  id: string
  label: string
  price: number
  qty: number
  line: number
}

interface Values {
  picked: string[]
  /** Prices edited by hand, by combo id: unticking and ticking a combo again keeps its price. */
  overrides: Record<string, number>
  skuRows: SkuRow[]
}

const COLOR: Record<string, string> = { white: '白色', black: '黑色' }
const labelOf = (row: { color: string; size: string }) => `${COLOR[row.color] ?? row.color}/${row.size}G`
const PICKS = CATALOG.map((row) => ({ label: labelOf(row), value: comboId(row), disabled: row.stock === 0 }))

const effects = defineEffects<Values>(({ reaction, watch }) => {
  // Action: the ticked combos changed → sync the rows. Rows that stay keep everything (edited price, qty).
  watch(
    (d) => d.picked.$value,
    (d) => {
      const before = d.skuRows.$value
      const overrides = d.overrides.$value
      d.skuRows.$value = d.picked.$value.flatMap((id) => {
        const kept = before.find((row) => row.id === id)
        if (kept) return [kept]
        const item = CATALOG.find((row) => comboId(row) === id)
        if (!item) return []
        const price = overrides[id] ?? item.price
        return [{ id, label: labelOf(item), price, qty: 1, line: price }]
      })
    },
  )
  // Remember a row's price under its combo id.
  watch.each(
    (d) => d.skuRows,
    (row, { d }) => {
      const id = row.id.$value
      if (id) d.overrides.$value = { ...d.overrides.$value, [id]: row.price.$value }
    },
  )
  // Derive: one instance per row, a cell edit recomputes that row only.
  reaction.each(
    (d) => d.skuRows,
    (row) => {
      row.line.$value = (row.price.$value ?? 0) * (row.qty.$value ?? 0)
    },
  )
})

const columns: ArrayTableColumn<SkuRow>[] = [
  { key: 'label', title: '组合', render: ({ record }) => record.label },
  { key: 'price', title: '单价', render: () => <Field name="price" component={[InputNumber, { min: 0 }]} /> },
  { key: 'qty', title: '数量', render: () => <Field name="qty" component={[InputNumber, { min: 1 }]} /> },
  { key: 'line', title: '小计', render: () => <Field name="line" component={[InputNumber]} /> },
]

/** Ticked combos become rows; a price edited by hand survives unticking and ticking the combo again. */
export function SkuPage() {
  const form = useForm<Values>({
    initialValues: { picked: [], overrides: {}, skuRows: [] },
    fields: { overrides: { virtual: true } },
    effects: [effects],
  })
  const [result, setResult] = useState('')
  return (
    <Form form={form} onSubmit={(values) => setResult(JSON.stringify(values, null, 2))}>
      <h1>SKU 组合</h1>
      <p>勾选组合生成行（缺货的不能选）；改过的单价记在组合上，取消勾选再勾回来价格还在。小计由 reaction.each 逐行计算。</p>
      <FormLayout labelCol={{ span: 3 }} wrapperCol={{ span: 18 }}>
        <Field name="picked" title="组合" enum={PICKS} decorator={[FormItem]} component={[Checkbox.Group]} />
      </FormLayout>
      <ArrayField name="skuRows" rowKey="id" component={[ArrayTable, { columns, pagination: false, settings: false }]} />
      <FormButtonGroup style={{ marginTop: 16 }}>
        <Submit />
      </FormButtonGroup>
      {result && <pre data-testid="result">{result}</pre>}
    </Form>
  )
}
