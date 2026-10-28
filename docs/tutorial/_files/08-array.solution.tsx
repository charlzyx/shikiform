import { useState } from 'react';
import { ArrayField, Form, defineEffects, useForm } from 'shikiform';
import { TextField, NumberField, SubmitButton } from './fields';

type Row = { id: string; name: string; price: number; qty: number; total: number };
type Values = { items: Row[] };

function createRow(): Row {
  return { id: crypto.randomUUID(), name: '', price: 0, qty: 1, total: 0 };
}

export const effects = defineEffects<Values>(({ reaction }) => {
  reaction.each(
    (d) => d.items,
    (row) => {
      const total = (row.price.$value || 0) * (row.qty.$value || 0);
      row.total.$value = total;
    },
  );
});

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm<Values>({
    initialValues: { items: [{ id: 'row-1', name: '贴纸', price: 2, qty: 4, total: 0 }] },
    effects: [effects],
  });
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <ArrayField name="items" rowKey="id">
        {({ index }) => (
          <fieldset>
            <legend>第 {index + 1} 行</legend>
            <TextField name="name" label="名称" />
            <NumberField name="price" label="单价" />
            <NumberField name="qty" label="数量" />
            <NumberField name="total" label="小计" />
            <button type="button" className="shiki-btn" onClick={() => form.removeArray('items', index)}>
              删除
            </button>
          </fieldset>
        )}
      </ArrayField>
      <button type="button" className="shiki-btn" onClick={() => form.pushArray('items', createRow())}>
        添加一行
      </button>
      <SubmitButton>提交</SubmitButton>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
