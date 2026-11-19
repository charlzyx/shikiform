import { localize } from '../language'
import { Field, Form, defineEffects, useForm } from '@shikiform/react'
import { ArrayTable, FormItem, InputNumber, Select, Switch, type ArrayTableColumn } from '../kit'

type Item = { id: string; sku: string; qty: number; price: number; line: number }
type Order = { id: string; no: string; status: string; amount: number; items: Item[] }
type Values = { editable: boolean; orders: Order[] }

const STATUS = [{ label: localize("待付款", "Pending"), value: 'pending' }, { label: localize("已付款", "Paid"), value: 'paid' }, { label: localize("已发货", "Shipped"), value: 'shipped' }]

const effects = defineEffects<Values>(({ reaction }) => {
  reaction((d) => {
    d.orders.$readOnly = d.editable.$value ? undefined : true
  })
  reaction.each((d) => d.orders, (order, { d, depth }) => {
    if (depth !== 0) return // items 也是对象数组；这一轮只处理订单
    order.$readOnly = order.status.$value === 'shipped' ? true : undefined // 已发货：整单预览
    order.status.$readOnly = !d.editable.$value // 状态本身始终跟随总开关；false 退出父级只读
    let amount = 0
    order.items.$value.forEach((item, index) => {
      const line = item.qty * item.price
      order.items[index].line.$value = line
      amount += line
    })
    order.amount.$value = amount
  })
})

// 单元格渲染在行作用域里：name 相对这一行
const itemColumns: ArrayTableColumn<Item>[] = [
  { key: 'sku', title: localize("商品", "Product"), render: ({ record }) => <code>{record.sku}</code> },
  {
    key: 'qty',
    title: localize("数量", "Quantity"),
    render: () => (
      <Field
        name="qty"
        decorator={[FormItem, { compact: true }]}
        component={[InputNumber, { min: 1 }]}
        rules={{ validator: (value, ctx) => (ctx.parent?.status === 'pending' && Number(value) > 99 ? localize("待付款单行不能超过 99", "A pending line cannot exceed 99 units") : null) }}
      />
    ),
  },
  { key: 'price', title: localize("单价", "Unit price"), render: () => <Field name="price" component={[InputNumber, { min: 0 }]} /> },
  { key: 'line', title: localize("行金额", "Line total"), render: () => <Field name="line" readOnly component={[InputNumber]} /> },
]

const orderColumns: ArrayTableColumn<Order>[] = [
  { key: 'no', title: localize("订单号", "Order number"), render: ({ record }) => record.no },
  { key: 'status', title: localize("状态", "Status"), render: () => <Field name="status" enum={STATUS} component={[Select, { style: { width: 120 } }]} /> },
  { key: 'amount', title: localize("合计", "Total"), render: () => <Field name="amount" readOnly component={[InputNumber]} /> },
]

/**
 * Orders with expandable line items: both levels are `<ArrayTable>`, so cells and the
 * expanded area render in the row scope and use relative names. Values are written directly (no shadow draft).
 */
export function OrdersPage() {
  const form = useForm<Values>({
    initialValues: {
      editable: true,
      orders: [
        { id: 'o1', no: 'A001', status: 'pending', amount: 0, items: [{ id: 'i1', sku: 'pen', qty: 1, price: 10, line: 0 }, { id: 'i2', sku: 'ink', qty: 2, price: 8, line: 0 }] },
        { id: 'o2', no: 'A002', status: 'shipped', amount: 0, items: [{ id: 'i3', sku: 'box', qty: 1, price: 20, line: 0 }] },
      ],
    },
    fields: { editable: { omit: true } },
    effects: [effects],
  })
  return (
    <main>
      <Form form={form}>
        <h1>{localize("订单行", "Order lines")}</h1>
        <Field name="editable" title={localize("可编辑", "Editable")} decorator={[FormItem]} component={[Switch]} />
        <ArrayTable
          name="orders"
          rowKey="id"
          columns={orderColumns}
          pagination={false}
          settings={false}
          expandable={{
            // 展开区也在订单行的作用域里：<ArrayTable name="items"> 就是 orders.N.items
            render: () => (
              <ArrayTable name="items" rowKey="id" columns={itemColumns} pagination={false} settings={false} size="small" />
            ),
          }}
        />
      </Form>
    </main>
  )
}
