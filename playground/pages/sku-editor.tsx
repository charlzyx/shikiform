import { localize } from '../language'
import { useState } from 'react'
import { Field, Form, useForm, useFormContext, useWatch, type Draft } from '@shikiform/react'
import { FormButtonGroup, FormItem, Input, InputNumber, MergedTable, Submit, Switch } from '../kit'
import { cloneSkus, paintGroupColor, type SkuRow } from '../skus'
import { tid } from '../testid'

interface Values {
  rows: SkuRow[]
  channelOn: boolean
}

/**
 * Flat SKU rows, grouped by color (display only: the value stays a flat array).
 * Editing the merged color writes that color onto every row in the group (one write of `rows`).
 * Turning on the channel column does not rebuild rows: price and stock stay on their row (`skuId`).
 */
export function SkuEditorPage() {
  const form = useForm<Values>({
    initialValues: { rows: cloneSkus(), channelOn: false },
    fields: { channelOn: { omit: true } },
  })
  const [result, setResult] = useState('')
  return (
    <main>
      <Form form={form} onSubmit={(values) => setResult(JSON.stringify(values, null, 2))}>
        <h1>{localize("SKU 表格", "SKU table")}</h1>
        <p data-testid="price-policy">
          {localize("按颜色合并单元格；改合并格里的颜色就是改这一组的每一行。打开「渠道列」时按 skuId 留在原行，已改的价格和库存不动，不按新的维度组合重新生成行。", "Editing a merged color cell updates every row in its group. Showing the channel column keeps each row keyed by skuId, preserving edited prices and stock.")}
        </p>
        <Field name="channelOn" title={localize("渠道列", "Channel column")} decorator={[FormItem]} component={[Switch, tid('add-dim')]} />
        <SkuTable />
        <FormButtonGroup style={{ marginTop: 16 }}>
          <Submit />
        </FormButtonGroup>
        {result && <pre data-testid="result">{result}</pre>}
      </Form>
    </main>
  )
}

function SkuTable() {
  const form = useFormContext<Values>()
  const rows = useWatch((d: Draft<Values>) => d.rows.$value) ?? []
  const channelOn = useWatch((d: Draft<Values>) => d.channelOn.$value) === true
  // A cell's path is the row's position in `rows`; the table row id is its skuId.
  const at = (skuId: string) => rows.findIndex((row) => row.skuId === skuId)
  return (
    <MergedTable
      rows={rows.map((row) => ({ ...row, id: row.skuId }))}
      groupOf={(row) => row.color}
      columns={[
        {
          title: localize("颜色", "Color"),
          key: 'color',
          merge: true,
          render: (row) => (
            <input
              className="sk-input"
              data-testid={`color-${row.skuId}`}
              aria-label={localize("颜色", "Color")}
              value={row.color}
              onChange={(event) => form.setValue('rows', paintGroupColor(rows, row.color, event.target.value))}
            />
          ),
        },
        { title: localize("容量", "Storage"), key: 'storage', render: (row) => <span data-testid={`storage-${row.skuId}`}>{row.storage}</span> },
        { title: localize("版本", "Edition"), key: 'edition', render: (row) => row.edition },
        {
          title: localize("价格", "Price"),
          key: 'price',
          render: (row) => <Field name={`rows.${at(row.skuId)}.price`} component={[InputNumber, { ...tid(`price-${row.skuId}`), min: 0 }]} />,
        },
        {
          title: localize("库存", "Stock"),
          key: 'stock',
          render: (row) => <Field name={`rows.${at(row.skuId)}.stock`} component={[InputNumber, { ...tid(`stock-${row.skuId}`), min: 0 }]} />,
        },
        ...(channelOn
          ? [{
              title: localize("渠道", "Channel"),
              key: 'channel',
              render: (row: SkuRow & { id: string }) => <Field name={`rows.${at(row.skuId)}.channel`} component={[Input, tid(`channel-${row.skuId}`)]} />,
            }]
          : []),
      ]}
    />
  )
}
