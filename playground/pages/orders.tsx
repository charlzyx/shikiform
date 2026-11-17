import { ArrayField, Field, Form, defineEffects, useForm } from '@shikiform/react'
import { ArrayTable, FormItem, InputNumber, Select, Switch, type ArrayTableColumn } from '@shikiform/antd'

type Item = { id: string; sku: string; qty: number; price: number; line: number }
type Order = { id: string; no: string; status: string; amount: number; items: Item[] }
type Values = { editable: boolean; orders: Order[] }

const STATUS = [{ label: '待付款', value: 'pending' }, { label: '已付款', value: 'paid' }, { label: '已发货', value: 'shipped' }]

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
  { key: 'sku', title: '商品', render: ({ record }) => <code>{record.sku}</code> },
  {
    key: 'qty', title: '数量',
    render: () => (
      <Field name="qty" decorator={[FormItem, { feedbackLayout: 'terse', style: { margin: 0 } }]} component={[InputNumber, { min: 1 }]}
        rules={{ validator: (value, ctx) => (ctx.parent?.status === 'pending' && Number(value) > 99 ? '待付款单行不能超过 99' : null) }} />
    ),
  },
  { key: 'price', title: '单价', render: () => <Field name="price" component={[InputNumber, { min: 0 }]} /> },
  { key: 'line', title: '行金额', render: () => <Field name="line" readOnly component={[InputNumber]} /> },
]

const orderColumns: ArrayTableColumn<Order>[] = [
  { key: 'no', title: '订单号', render: ({ record }) => record.no },
  { key: 'status', title: '状态', render: () => <Field name="status" enum={STATUS} component={[Select, { style: { width: 110 } }]} /> },
  { key: 'amount', title: '合计', render: () => <Field name="amount" readOnly component={[InputNumber]} /> },
]

/**
 * Orders with expandable line items: both levels are `<ArrayField component={[ArrayTable, { columns }]}>`, so cells and the
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
    <Form form={form}>
      <h1>订单行</h1>
      <Field name="editable" title="可编辑" decorator={[FormItem]} component={[Switch]} />
      <ArrayField name="orders" rowKey="id" component={[ArrayTable, {
        columns: orderColumns, pagination: false, settings: false,
        // 展开区也在订单行的作用域里：<ArrayField name="items"> 就是 orders.N.items
        expandable: { render: () => <ArrayField name="items" rowKey="id" component={[ArrayTable, { columns: itemColumns, pagination: false, settings: false, size: 'small' }]} /> },
      }]} />
    </Form>
  )
}
