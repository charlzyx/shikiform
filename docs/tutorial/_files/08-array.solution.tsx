import { useState } from 'react';
import { ArrayField, Field, Form, Submit, defineEffects, useForm, useRow } from 'shikiform';
import { FormItem, Input, NumberInput } from 'shikiform/ui';

let seq = 1;
function createRow() {
  seq += 1;
  return { id: `row-${seq}`, name: '', price: 0, qty: 1, total: 0 };
}

const effects = defineEffects(({ reaction }) => {
  reaction.each(
    (d) => d.items,
    (row) => {
      const total = (row.price.$value || 0) * (row.qty.$value || 0);
      row.total.$value = total;
    },
  );
});

function Remove() {
  const row = useRow();
  return (
    <button type="button" className="shiki-btn" onClick={row.remove}>
      删除
    </button>
  );
}

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm({
    initialValues: { items: [{ id: 'row-1', name: '贴纸', price: 2, qty: 4, total: 0 }] },
    effects: [effects],
  });
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <ArrayField name="items" rowKey="id" createRow={createRow}>
        <Field name="name" decorator={<FormItem label="名称" />}>
          <Input />
        </Field>
        <Field name="price" decorator={<FormItem label="单价" />}>
          <NumberInput />
        </Field>
        <Field name="qty" decorator={<FormItem label="数量" />}>
          <NumberInput />
        </Field>
        <Field name="total" decorator={<FormItem label="小计" />}>
          <NumberInput />
        </Field>
        <Remove />
      </ArrayField>
      <Submit>提交</Submit>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
