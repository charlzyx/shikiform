import { useState } from 'react'
import { Button, Drawer } from 'antd'
import { ArrayField, defineEffects, Field, Form, useForm, useFormContext, useRecord, useWatch, type Draft } from '@shikiform/react'
import { FormItem, FormLayout, Input, InputNumber, Switch } from '@shikiform/antd'

interface Order {
  id: string
  title: string
  qty: number
  locked: boolean
}

interface Values {
  editMode: boolean
  open: boolean
  city: string
  orders: Order[]
}

const effects = defineEffects<Values>(({ reaction }) => {
  reaction((d) => {
    d.orders.$pattern = d.editMode.$value ? undefined : 'readPretty'
  })
  // One instance per row: a locked row's qty reads, the others inherit the array's pattern.
  reaction.each(
    (d) => d.orders,
    (row) => {
      row.qty.$pattern = row.locked.$value ? 'readPretty' : undefined
    },
  )
})

/**
 * Collapsing the list unmounts its fields and a drawer holds another one; values live in the form, so both come back
 * unchanged. Rows use relative names inside `<ArrayField>`.
 */
export function NestedPage() {
  const form = useForm<Values>({
    initialValues: {
      editMode: true,
      open: false,
      city: '',
      orders: [
        { id: 'o1', title: '未发货', qty: 1, locked: false },
        { id: 'o2', title: '已发货', qty: 2, locked: true },
      ],
    },
    effects: [effects],
    fields: { open: { display: 'virtual' }, editMode: { display: 'virtual' } },
  })
  return (
    <Form form={form}>
      <NestedBody />
    </Form>
  )
}

function NestedBody() {
  const form = useFormContext<Values>()
  const open = useWatch((d: Draft<Values>) => d.open.$value)
  const [expanded, setExpanded] = useState(true)
  return (
    <FormLayout labelCol={{ span: 4 }} wrapperCol={{ span: 20 }}>
      <Field name="editMode" title="可编辑" decorator={[FormItem]} component={[Switch, { 'data-testid': 'edit-mode' }]} />
      <Button data-testid="toggle-orders" onClick={() => setExpanded((value) => !value)}>
        {expanded ? '收起' : '展开'}
      </Button>
      {expanded ? (
        <div data-testid="orders">
          <ArrayField name="orders" rowKey="id">
            {({ index }) => <OrderRow index={index} />}
          </ArrayField>
        </div>
      ) : (
        <div data-testid="orders-collapsed">已收起</div>
      )}
      <Button data-testid="open-drawer" onClick={() => form.setValue('open', true)}>
        地址
      </Button>
      <Drawer open={!!open} onClose={() => form.setValue('open', false)} title="地址">
        <Field name="city" title="城市" decorator={[FormItem]} component={[Input, { 'data-testid': 'city' }]} />
      </Drawer>
    </FormLayout>
  )
}

function OrderRow({ index }: { index: number }) {
  const order = useRecord<Order>()
  return (
    <div data-testid={`order-${index}`}>
      <Field name="qty" title={order.title} decorator={[FormItem]} component={[InputNumber]} />
    </div>
  )
}
