import { useState } from 'react'
import { Input as AntInput } from 'antd'
import { Field, Form, useForm, useFormContext, useWatch, type Draft } from 'shikiform'
import { FormButtonGroup, FormItem, Input, InputNumber, MergedTable, Submit, Switch } from 'shikiform/antd'
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
    fields: { channelOn: { display: 'virtual' } },
  })
  const [result, setResult] = useState('')
  return (
    <Form form={form} onSubmit={(values) => setResult(JSON.stringify(values, null, 2))}>
      <h1>SKU 表格</h1>
      <p data-testid="price-policy">
        按颜色合并单元格；改合并格里的颜色就是改这一组的每一行。打开「渠道列」时按 skuId 留在原行，已改的价格和库存不动，不按新的维度组合重新生成行。
      </p>
      <Field name="channelOn" title="渠道列" decorator={[FormItem]} component={[Switch, tid('add-dim')]} />
      <SkuTable />
      <FormButtonGroup style={{ marginTop: 16 }}>
        <Submit />
      </FormButtonGroup>
      {result && <pre data-testid="result">{result}</pre>}
    </Form>
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
          title: '颜色',
          key: 'color',
          merge: true,
          render: (row) => (
            <AntInput
              data-testid={`color-${row.skuId}`}
              aria-label="颜色"
              value={row.color}
              onChange={(event) => form.setValue('rows', paintGroupColor(rows, row.color, event.target.value))}
            />
          ),
        },
        { title: '容量', key: 'storage', render: (row) => <span data-testid={`storage-${row.skuId}`}>{row.storage}</span> },
        { title: '版本', key: 'edition', render: (row) => row.edition },
        {
          title: '价格',
          key: 'price',
          render: (row) => <Field name={`rows.${at(row.skuId)}.price`} component={[InputNumber, { ...tid(`price-${row.skuId}`), min: 0 }]} />,
        },
        {
          title: '库存',
          key: 'stock',
          render: (row) => <Field name={`rows.${at(row.skuId)}.stock`} component={[InputNumber, { ...tid(`stock-${row.skuId}`), min: 0 }]} />,
        },
        ...(channelOn
          ? [{
              title: '渠道',
              key: 'channel',
              render: (row: SkuRow & { id: string }) => <Field name={`rows.${at(row.skuId)}.channel`} component={[Input, tid(`channel-${row.skuId}`)]} />,
            }]
          : []),
      ]}
    />
  )
}
