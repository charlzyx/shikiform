import { localize } from '../language'
import { useState } from 'react'
import { defineEffects, Field, Form, useForm } from '@shikiform/react'
import { ArrayTable, Checkbox, FormButtonGroup, FormItem, FormLayout, InputNumber, Submit, type ArrayTableColumn } from '../kit'
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

const COLOR: Record<string, string> = { white: localize("白色", "White"), black: localize("黑色", "Black") }
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
      if (id) d.overrides[id].$value = row.price.$value
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
  { key: 'label', title: localize("组合", "Combination"), render: ({ record }) => record.label },
  { key: 'price', title: localize("单价", "Unit price"), render: () => <Field name="price" component={[InputNumber, { min: 0 }]} /> },
  { key: 'qty', title: localize("数量", "Quantity"), render: () => <Field name="qty" component={[InputNumber, { min: 1 }]} /> },
  { key: 'line', title: localize("小计", "Subtotal"), render: () => <Field name="line" readOnly component={[InputNumber]} /> },
]

/** Ticked combos become rows; a price edited by hand survives unticking and ticking the combo again. */
export function SkuPage() {
  const form = useForm<Values>({
    initialValues: { picked: [], overrides: {}, skuRows: [] },
    fields: { overrides: { omit: true } },
    effects: [effects],
  })
  const [result, setResult] = useState('')
  return (
    <main>
      <Form form={form} onSubmit={(values) => setResult(JSON.stringify(values, null, 2))}>
        <h1>{localize("SKU 组合", "SKU combinations")}</h1>
        <p>{localize("勾选组合生成行（缺货的不能选）；改过的单价记在组合上，取消勾选再勾回来价格还在。小计由 reaction.each 逐行计算。", "Select an in-stock combination to create a row. Its edited price survives removing and reselecting it. reaction.each computes each subtotal independently.")}</p>
        <FormLayout>
          <Field name="picked" title={localize("组合", "Combination")} enum={PICKS} decorator={[FormItem]} component={[Checkbox.Group]} />
        </FormLayout>
        <ArrayTable name="skuRows" rowKey="id" columns={columns} pagination={false} settings={false} />
        <FormButtonGroup style={{ marginTop: 16 }}>
          <Submit />
        </FormButtonGroup>
        {result && <pre data-testid="result">{result}</pre>}
      </Form>
    </main>
  )
}
