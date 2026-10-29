import { defineEffects, Field, Form, useArrayField, useForm } from 'shikiform'
import { CATALOG, comboId } from '../data'

interface SkuRow {
  id: string
  color: string
  size: string
  price: number
  qty: number
  line: number
  soldOut: boolean
}

interface Values {
  picked: string[]
  overrides: Record<string, number>
  skuRows: SkuRow[]
}

const effects = defineEffects<Values>(({ reaction, watch }) => {
  reaction((d) => {
    const picked = d.picked.$value ?? []
    const overrides = d.overrides.$value ?? {}
    const next: SkuRow[] = []
    for (const id of picked) {
      const item = CATALOG.find((row) => comboId(row) === id)
      if (!item || item.stock === 0) continue
      const price = overrides[id] ?? item.price
      next.push({ id, color: item.color, size: item.size, price, qty: 1, line: price, soldOut: item.stock === 0 })
    }
    d.skuRows.$value = next
  })
  watch.each(
    (d) => d.skuRows,
    (row, { d }) => {
      const id = row.id.$value
      if (!id) return
      const price = row.price.$value
      const book = { ...(d.overrides.$value ?? {}) }
      book[id] = price
      d.overrides.$value = book
    },
  )
  reaction.each(
    (d) => d.skuRows,
    (row) => {
      row.qty.$pattern = row.soldOut.$value ? 'disabled' : undefined
      row.line.$value = (row.price.$value ?? 0) * (row.qty.$value ?? 0)
    },
  )
})

export function SkuPage() {
  const form = useForm<Values>({
    initialValues: { picked: [], overrides: {}, skuRows: [] },
    fields: { overrides: { virtual: true }, skuRows: { virtual: true } },
    effects: [effects],
  })
  return (
    <Form form={form}>
      <Field name="picked">
        {(field) => (
          <div>
            {CATALOG.map((row) => {
              const id = comboId(row)
              const picked = field.value ?? []
              return (
                <label key={id}>
                  <input
                    type="checkbox"
                    data-testid={`combo-${id}`}
                    disabled={row.stock === 0}
                    checked={picked.includes(id)}
                    onChange={(event) => {
                      const next = new Set(picked)
                      if (event.target.checked) next.add(id)
                      else next.delete(id)
                      field.onChange([...next])
                    }}
                  />
                  {row.color}/{row.size}
                </label>
              )
            })}
          </div>
        )}
      </Field>
      <SkuTable />
    </Form>
  )
}

function SkuTable() {
  const rows = useArrayField('skuRows')
  return (
    <table>
      <tbody>
        {rows.keys.map((row) => (
          <SkuLine key={row.key} index={row.index} />
        ))}
      </tbody>
    </table>
  )
}

function SkuLine({ index }: { index: number }) {
  return (
    <tr data-testid={`sku-${index}`}>
      <td>
        <Field name={`skuRows.${index}.price`}>
          {(field) => (
            <input
              data-testid={`price-${index}`}
              value={field.value ?? ''}
              onChange={(event) => field.onChange(Number(event.target.value))}
            />
          )}
        </Field>
      </td>
      <td>
        <Field name={`skuRows.${index}.qty`}>
          {(field) => (
            <input
              data-testid={`qty-${index}`}
              disabled={field.disabled}
              value={field.value ?? ''}
              onChange={(event) => field.onChange(Number(event.target.value))}
            />
          )}
        </Field>
      </td>
      <td data-testid={`line-${index}`}>
        <Field name={`skuRows.${index}.line`}>{(field) => <span>{field.value}</span>}</Field>
      </td>
    </tr>
  )
}
