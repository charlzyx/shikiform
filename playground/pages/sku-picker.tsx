import { Field, Form, useForm } from 'shikiform'
import { DIM_LABEL, DIMS, skuPickerEffects, type Dim, type SkuSelection } from '../skus'

export function SkuPickerPage() {
  const form = useForm<SkuSelection>({
    initialValues: { qty: 1, skuId: '', priceText: '—', stock: null },
    effects: [skuPickerEffects],
  })
  return (
    <Form form={form}>
      <h1>SKU 选择器</h1>
      <p>可以随时切换任一维度；与新选择冲突的维度会清空，缺货组合仍不可选。</p>
      {DIMS.map((dim) => (
        <DimRadios key={dim} dim={dim} />
      ))}
      <p>
        价格 <span data-testid="price-text"><Field name="priceText">{(field) => <>{field.value}</>}</Field></span>
      </p>
      <p>
        库存 <span data-testid="stock"><Field name="stock">{(field) => <>{field.value ?? '—'}</>}</Field></span>
      </p>
      <p>
        SKU <span data-testid="sku-id"><Field name="skuId">{(field) => <>{field.value || '—'}</>}</Field></span>
      </p>
      <Field name="qty">
        {(field) => (
          <label>
            数量
            <input
              data-testid="qty"
              type="number"
              min={1}
              disabled={field.disabled}
              value={field.value ?? ''}
              onChange={(event) => field.onChange(event.target.value === '' ? 0 : Number(event.target.value))}
              onBlur={field.onBlur}
            />
            <span data-testid="qty-error">{field.errors[0] ?? ''}</span>
          </label>
        )}
      </Field>
    </Form>
  )
}

function DimRadios({ dim }: { dim: Dim }) {
  return (
    <fieldset>
      <legend>{DIM_LABEL[dim]}</legend>
      <Field name={dim}>
        {(field) => (
          <div data-testid={`dim-${dim}`}>
            {field.options.map((option) => {
              const value = String(option.value)
              const disabled = !!option.disabled || field.disabled
              return (
                <label key={value} data-testid={`opt-${dim}-${value}`} data-disabled={disabled ? 'true' : 'false'}>
                  <input
                    type="radio"
                    name={dim}
                    value={value}
                    disabled={disabled}
                    checked={field.value === value}
                    onChange={() => field.onChange(value)}
                  />
                  {option.label}
                </label>
              )
            })}
          </div>
        )}
      </Field>
    </fieldset>
  )
}
