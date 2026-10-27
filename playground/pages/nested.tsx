import { useState } from 'react'
import { Button, Drawer } from 'antd'
import { defineEffects, Field, Form, useForm, useFormContext, useWatch, type Draft } from 'shikiform'

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
    d.orders.$pattern = d.editMode.$value ? 'editable' : 'readPretty'
  })
  reaction.each(
    (d) => d.orders,
    (row) => {
      if (row.locked.$value) row.qty.$pattern = 'readPretty'
      else row.qty.$pattern = undefined
    },
  )
})

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
    fields: { open: { virtual: true } },
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
    <>
      <Field name="editMode">
        {(field) => (
          <label>
            <input
              data-testid="edit-mode"
              type="checkbox"
              checked={!!field.value}
              onChange={(event) => field.onChange(event.target.checked)}
            />
            可编辑
          </label>
        )}
      </Field>
      <button type="button" data-testid="toggle-orders" onClick={() => setExpanded((value) => !value)}>
        {expanded ? '收起' : '展开'}
      </button>
      {expanded ? (
        <div data-testid="orders">
          <Field name="orders.0.qty">
            {(field) =>
              field.pattern === 'readPretty' ? (
                <span data-testid="qty-0">{field.value}</span>
              ) : (
                <input
                  data-testid="qty-0"
                  value={field.value ?? ''}
                  onChange={(event) => field.onChange(Number(event.target.value))}
                />
              )
            }
          </Field>
          <Field name="orders.1.qty">
            {(field) => <span data-testid="qty-1">{field.pattern === 'readPretty' ? field.value : 'editable'}</span>}
          </Field>
        </div>
      ) : (
        <div data-testid="orders-collapsed">已收起</div>
      )}
      <Button data-testid="open-drawer" onClick={() => form.setValue('open', true)}>
        地址
      </Button>
      <Drawer open={!!open} onClose={() => form.setValue('open', false)} title="地址">
        <Field name="city">
          {(field) => (
            <input data-testid="city" value={field.value ?? ''} onChange={(event) => field.onChange(event.target.value)} />
          )}
        </Field>
      </Drawer>
    </>
  )
}
