import { useState } from 'react'
import { ArrayField, Form, defineEffects, useArrayField, useForm, useFormContext, useWatch, type Draft } from '@shikiform/react'
import { NumberField, TextField } from './fields'

type Item = { id: string; product: { name: string; price: number }; qty: number; total: number }
type Values = { items: Item[] }
const effects = defineEffects<Values>(({ reaction }) => {
  reaction.each((d) => d.items, (row) => { row.total.$value = row.product.price.$value * row.qty.$value })
})
export function ArrayDemo() {
  const form = useForm<Values>({ initialValues: { items: [
    { id: 'a', product: { name: '钢笔', price: 10 }, qty: 2, total: 0 },
    { id: 'b', product: { name: '墨水', price: 8 }, qty: 1, total: 0 },
  ] }, effects: [effects] })
  const [submitted, setSubmitted] = useState('尚未提交')
  return <Form form={form} onSubmit={(values) => setSubmitted(JSON.stringify(values))}>
    <Rows />
    <button type="submit">提交采购单</button>
    <button type="button" onClick={() => form.reset()}>重置</button>
    <pre data-testid="submit-result">{submitted}</pre>
  </Form>
}
function Rows() {
  const array = useArrayField<Values, 'items'>('items', { rowKey: 'id' })
  const form = useFormContext<Values>()
  const [sequence, setSequence] = useState(0)
  const total = useWatch((d: Draft<Values>) => d.items.$value.reduce((sum, row) => sum + row.total, 0))
  return <section aria-label="采购单">
    <ArrayField name="items" rowKey="id">
      {({ key, index }) => <fieldset data-row-id={key}>
        <legend>商品 {index + 1}</legend>
        <TextField name="product.name" label={`名称 ${key}`} />
        <NumberField name="product.price" label={`单价 ${key}`} />
        <NumberField name="qty" label={`数量 ${key}`} />
        <button type="button" disabled={index === 0} onClick={() => array.move(index, index - 1)}>上移 {key}</button>
        <button type="button" onClick={() => array.remove(index)}>删除 {key}</button>
      </fieldset>}
    </ArrayField>
    <button type="button" onClick={() => { const next = sequence + 1; setSequence(next); array.push({ id: `new-${next}`, product: { name: '新商品', price: 1 }, qty: 1, total: 0 }) }}>添加商品</button>
    <output data-testid="total">合计：{total}</output>
    <button type="button" disabled={array.keys.length === 0} onClick={() => form.setValue('items.0.qty', 3)}>首行数量设为 3</button>
  </section>
}

export default ArrayDemo
