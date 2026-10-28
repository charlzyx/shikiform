import { Table } from 'antd'
import { defineEffects, Field, Form, useForm, useFormContext, useWatch, type Draft } from 'shikiform'

interface Item {
  id: string
  sku: string
  qty: number
  price: number
  lineTotal: number
}

interface Order {
  id: string
  no: string
  customer: string
  status: string
  items: Item[]
  amount: number
}

interface Values {
  editMode: boolean
  expandedKeys: string[]
  orders: Order[]
}

const INITIAL: Order[] = [
  {
    id: 'o1',
    no: 'A001',
    customer: '甲',
    status: 'pending',
    amount: 0,
    items: [
      { id: 'i1', sku: 'pen', qty: 1, price: 10, lineTotal: 0 },
      { id: 'i2', sku: 'ink', qty: 2, price: 8, lineTotal: 0 },
    ],
  },
  {
    id: 'o2',
    no: 'A002',
    customer: '乙',
    status: 'shipped',
    amount: 0,
    items: [{ id: 'i3', sku: 'box', qty: 1, price: 20, lineTotal: 0 }],
  },
]

const effects = defineEffects<Values>(({ reaction }) => {
  reaction((d) => {
    d.orders.$pattern = d.editMode.$value ? 'editable' : 'readPretty'
  })
  reaction.each(
    (d) => d.orders,
    (order) => {
      const status = order.status.$value
      const locked = status === 'shipped' || status === 'cancelled'
      order.$pattern = locked ? 'readPretty' : undefined
      const items = order.items.$value ?? []
      let amount = 0
      for (let index = 0; index < items.length; index += 1) {
        const line = (items[index]?.qty ?? 0) * (items[index]?.price ?? 0)
        order.items[index].lineTotal.$value = line
        amount += line
      }
      order.amount.$value = amount
    },
  )
})

/**
 * Expand a row to edit its items. Values are written onto the order immediately.
 * There is no shadow draft and no cancel rollback.
 */
export function OrdersPage() {
  const form = useForm<Values>({
    initialValues: { editMode: true, expandedKeys: [], orders: INITIAL },
    effects: [effects],
    fields: { expandedKeys: { virtual: true }, editMode: { virtual: true } },
  })
  return (
    <Form form={form}>
      <OrdersBody />
    </Form>
  )
}

function OrdersBody() {
  const form = useFormContext<Values>()
  const orders = useWatch((d: Draft<Values>) => d.orders.$value) ?? []
  const expandedKeys = useWatch((d: Draft<Values>) => d.expandedKeys.$value) ?? []
  const editMode = useWatch((d: Draft<Values>) => d.editMode.$value) === true
  return (
    <main>
      <h1>订单行</h1>
      <p data-testid="draft-note">直接写入正式值。不做 Shadow 草稿，没有取消回滚。</p>
      <Field name="editMode">
        {(field) => (
          <label>
            <input
              data-testid="edit-mode"
              type="checkbox"
              checked={!!field.value}
              onChange={(event) => field.onChange(event.target.checked)}
            />
            编辑
          </label>
        )}
      </Field>
      <Table<Order>
        rowKey="id"
        pagination={false}
        dataSource={orders}
        expandable={{
          expandedRowKeys: expandedKeys,
          onExpand: (open, record) => {
            const next = new Set(expandedKeys)
            if (open) next.add(record.id)
            else next.delete(record.id)
            form.setValue('expandedKeys', [...next])
          },
          expandIcon: ({ expanded, onExpand, record }) => (
            <button type="button" data-testid={`expand-${record.id}`} onClick={(event) => onExpand(record, event)}>
              {expanded ? '收起' : '展开'}
            </button>
          ),
          expandedRowRender: (record) => <OrderItems orderId={record.id} />,
        }}
        columns={[
          { title: '订单号', dataIndex: 'no' },
          {
            title: '客户',
            render: (_, record) => {
              const index = orders.findIndex((order) => order.id === record.id)
              return (
                <Field name={`orders.${index}.customer`}>
                  {(field) =>
                    field.pattern === 'readPretty' ? (
                      <span data-testid={`customer-${record.id}`}>{field.value}</span>
                    ) : (
                      <input
                        data-testid={`customer-${record.id}`}
                        value={field.value ?? ''}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    )
                  }
                </Field>
              )
            },
          },
          {
            title: '状态',
            render: (_, record) => {
              const index = orders.findIndex((order) => order.id === record.id)
              return (
                <Field name={`orders.${index}.status`}>
                  {(field) =>
                    field.pattern === 'readPretty' ? (
                      <span data-testid={`status-${record.id}`}>{field.value}</span>
                    ) : (
                      <select
                        data-testid={`status-${record.id}`}
                        value={field.value ?? ''}
                        onChange={(event) => field.onChange(event.target.value)}
                      >
                        <option value="pending">待付款</option>
                        <option value="paid">已付款</option>
                        <option value="shipped">已发货</option>
                        <option value="cancelled">已取消</option>
                      </select>
                    )
                  }
                </Field>
              )
            },
          },
          {
            title: '金额',
            render: (_, record) => <span data-testid={`amount-${record.id}`}>{record.amount}</span>,
          },
        ]}
      />
      <span data-testid="edit-flag">{editMode ? 'editing' : 'reading'}</span>
    </main>
  )
}

function OrderItems({ orderId }: { orderId: string }) {
  const orders = useWatch((d: Draft<Values>) => d.orders.$value) ?? []
  const index = orders.findIndex((order) => order.id === orderId)
  const items = orders[index]?.items ?? []
  if (index < 0) return null
  return (
    <div data-testid={`items-${orderId}`}>
      {items.map((item, itemIndex) => (
        <div key={item.id}>
          <span>{item.sku}</span>
          <Field
            name={`orders.${index}.items.${itemIndex}.qty`}
            rules={[
              {
                validator: (value, ctx) =>
                  ctx.parent?.status === 'pending' && Number(value) > 99 ? '待付款单行不能超过 99' : null,
              },
            ]}
          >
            {(field) =>
              field.pattern === 'readPretty' ? (
                <span data-testid={`qty-${item.id}`}>{field.value}</span>
              ) : (
                <input
                  data-testid={`qty-${item.id}`}
                  value={field.value ?? ''}
                  onChange={(event) => field.onChange(Number(event.target.value))}
                  onBlur={field.onBlur}
                />
              )
            }
          </Field>
          <span data-testid={`line-${item.id}`}>{item.lineTotal}</span>
        </div>
      ))}
    </div>
  )
}
