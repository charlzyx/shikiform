import { memo, useEffect, useRef } from 'react'
import { Form, RowScope, useArrayField, useField, useForm, VirtualRows, defineEffects } from '@shikiform/react'

interface Row {
  id: string
  sku: string
  cost: number
  markup: number
  price: number
  suggested: number
}

const effects = defineEffects<{ rows: Row[] }>(({ reaction }) => {
  reaction.each(
    (d) => d.rows,
    (row) => {
      const cost = row.cost.$value ?? 0
      const markup = row.markup.$value ?? 0
      row.suggested.$value = Math.round(cost * (1 + markup / 100))
    },
  )
})

function makeRows(count: number): Row[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `r${index}`,
    sku: `sku-${index}`,
    cost: 10,
    markup: 5,
    price: 12,
    suggested: 0,
  }))
}

export function LargePage() {
  return (
    <main>
      <Tier label="200" rows={40} />
      <Tier label="1000" rows={200} />
    </main>
  )
}

function Tier({ label, rows }: { label: string; rows: number }) {
  const form = useForm<{ rows: Row[] }>({
    initialValues: { rows: makeRows(rows) },
    effects: [effects],
  })
  useEffect(() => {
    const bag = ((window as unknown as { __shiki?: Record<string, unknown> }).__shiki ??= {})
    bag[label] = form
  }, [form, label])
  return (
    <section data-tier={label}>
      <h2>
        {label} fields ({rows * 5})
      </h2>
      <Form form={form}>
        <TierList />
      </Form>
    </section>
  )
}

function TierList() {
  const array = useArrayField('rows')
  return (
    <VirtualRows count={array.keys.length} height={360} rowHeight={36} overscan={2}>
      {(index) => <PerfRow index={index} />}
    </VirtualRows>
  )
}

const PerfRow = memo(function PerfRow({ index }: { index: number }) {
  const renders = useRef(0)
  renders.current += 1
  return (
    <RowScope path={`rows.${index}`} index={index}>
      <div data-index={index} data-row-renders={renders.current}>
        <Cell name="sku" index={index} />
        <Cell name="cost" index={index} numeric />
        <Cell name="markup" index={index} numeric />
        <Cell name="price" index={index} numeric />
        <Cell name="suggested" index={index} numeric />
      </div>
    </RowScope>
  )
})

function Cell({ name, index, numeric }: { name: string; index: number; numeric?: boolean }) {
  const field = useField(name)
  const renders = useRef(0)
  renders.current += 1
  return (
    <input
      data-testid={`${name}-${index}`}
      data-renders={renders.current}
      value={field.value ?? ''}
      onChange={(event) => field.onChange(numeric ? Number(event.target.value) : event.target.value)}
    />
  )
}
