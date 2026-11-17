import { Form, typed, useForm } from '@shikiform/react'
import { FormItem, FormLayout, Input, InputNumber, Radio } from '@shikiform/antd'
import { DIM_LABEL, DIMS, skuPickerEffects, type SkuSelection } from '../skus'

/**
 * Options and their `disabled` come from a reaction (`$enum`); a `watch` clears the dimensions that conflict with
 * the one just picked. Price, stock and SKU are written by a reaction and declared `readOnly`, so they render as text.
 */
export function SkuPickerPage() {
  const form = useForm<SkuSelection>({
    initialValues: { qty: 1, skuId: '', priceText: '—', stock: null },
    effects: [skuPickerEffects],
  })
  const F = typed(form)
  return (
    <Form form={form}>
      <h1>SKU 选择器</h1>
      <p>
        任意顺序选维度；与新选择冲突的维度会清空，缺货组合不可选。只剩一个 SKU 时直接显示它，剩下的维度不用再点。
      </p>
      <FormLayout labelCol={{ span: 3 }} wrapperCol={{ span: 12 }}>
        {DIMS.map((dim) => (
          <F.Field key={dim} name={dim} title={DIM_LABEL[dim]} decorator={[FormItem]} component={[Radio, { optionType: 'button' }]} />
        ))}
        <F.Field name="priceText" title="价格" readOnly decorator={[FormItem]} component={[Input]} />
        <F.Field name="stock" title="库存" readOnly decorator={[FormItem]} component={[InputNumber]} />
        <F.Field name="skuId" title="SKU" readOnly decorator={[FormItem]} component={[Input]} />
        <F.Field name="qty" title="数量" decorator={[FormItem]} component={[InputNumber, { min: 1 }]} />
      </FormLayout>
    </Form>
  )
}
