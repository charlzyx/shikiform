import { MergedTable } from 'shikiform/antd'
import { Field, Form, useForm, useFormContext, useWatch, type Draft } from 'shikiform'
import { cloneSkus, paintGroupColor, type SkuRow } from '../skus'

interface Values {
  rows: SkuRow[]
  channelOn: boolean
}

/**
 * Flat SKU rows, grouped by color.
 * Editing the merged color writes that color onto every row in the group.
 * Turning on the channel column does not rebuild rows: price and stock stay on skuId.
 */
export function SkuEditorPage() {
  const form = useForm<Values>({
    initialValues: { rows: cloneSkus(), channelOn: false },
    fields: { channelOn: { virtual: true } },
  })
  return (
    <Form form={form}>
      <SkuEditorBody />
    </Form>
  )
}

function SkuEditorBody() {
  const form = useFormContext<Values>()
  const rows = useWatch((d: Draft<Values>) => d.rows.$value) ?? []
  const channelOn = useWatch((d: Draft<Values>) => d.channelOn.$value) === true
  const view = rows.map((row) => ({ ...row, id: row.skuId }))
  return (
    <main>
      <h1>SKU 表格</h1>
      <p data-testid="price-policy">增加维度时按 skuId 留在原行，已改的价格和库存不动。不按新的维度组合重新生成行。</p>
      <button type="button" data-testid="add-dim" onClick={() => form.setValue('channelOn', true)}>
        增加渠道列
      </button>
      <pre data-testid="colors">{rows.map((row) => row.color).join(',')}</pre>
      <MergedTable
        rows={view}
        groupOf={(row) => row.color}
        columns={[
          {
            title: '颜色',
            key: 'color',
            merge: true,
            render: (row) => {
              const index = rows.findIndex((item) => item.skuId === row.skuId)
              return (
                <input
                  data-testid={`color-${row.skuId}`}
                  value={row.color}
                  onChange={(event) => {
                    form.setValue('rows', paintGroupColor(rows, row.color, event.target.value))
                  }}
                  aria-label={`颜色-${index}`}
                />
              )
            },
          },
          {
            title: '容量',
            key: 'storage',
            render: (row) => <span data-testid={`storage-${row.skuId}`}>{row.storage}</span>,
          },
          {
            title: '版本',
            key: 'edition',
            render: (row) => <span>{row.edition}</span>,
          },
          {
            title: '价格',
            key: 'price',
            render: (row) => {
              const index = rows.findIndex((item) => item.skuId === row.skuId)
              return (
                <Field name={`rows.${index}.price`}>
                  {(field) => (
                    <input
                      data-testid={`price-${row.skuId}`}
                      value={field.value ?? ''}
                      onChange={(event) => field.onChange(Number(event.target.value))}
                    />
                  )}
                </Field>
              )
            },
          },
          {
            title: '库存',
            key: 'stock',
            render: (row) => {
              const index = rows.findIndex((item) => item.skuId === row.skuId)
              return (
                <Field name={`rows.${index}.stock`}>
                  {(field) => (
                    <input
                      data-testid={`stock-${row.skuId}`}
                      value={field.value ?? ''}
                      onChange={(event) => field.onChange(Number(event.target.value))}
                    />
                  )}
                </Field>
              )
            },
          },
          ...(channelOn
            ? [
                {
                  title: '渠道',
                  key: 'channel',
                  render: (row: SkuRow & { id: string }) => {
                    const index = rows.findIndex((item) => item.skuId === row.skuId)
                    return (
                      <Field name={`rows.${index}.channel`}>
                        {(field) => (
                          <input
                            data-testid={`channel-${row.skuId}`}
                            value={field.value ?? ''}
                            onChange={(event) => field.onChange(event.target.value)}
                          />
                        )}
                      </Field>
                    )
                  },
                },
              ]
            : []),
        ]}
      />
    </main>
  )
}
