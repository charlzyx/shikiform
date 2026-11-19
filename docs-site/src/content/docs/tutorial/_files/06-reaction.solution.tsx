import { useState } from 'react';
import { Field, Form, Submit, defineEffects, useField, useForm } from '@shikiform/react';

type Values = { price: number; qty: number; amount: number };

function NumberInput() {
  const f = useField<number>();
  return (
    <p>
      <label htmlFor={f.id}>{f.title}：</label>
      <input
        id={f.id}
        type="number"
        value={f.value ?? 0}
        onChange={(e) => f.onChange(Number(e.target.value))}
        onBlur={f.onBlur}
      />
      {f.description && <small style={{ marginLeft: 8, opacity: 0.7 }}>{f.description}</small>}
    </p>
  );
}

export const effects = defineEffects<Values>(({ reaction }) => {
  reaction((d) => {
    const amount = (d.price.$value || 0) * (d.qty.$value || 0);
    d.amount.$value = amount;
  });
});

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm<Values>({ initialValues: { price: 10, qty: 2, amount: 0 }, effects: [effects] });
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <Field name="price" title="单价" component={[NumberInput]} />
      <Field name="qty" title="数量" component={[NumberInput]} />
      <Field name="amount" title="金额" description="reaction 写 $value：计算字段，默认仍提交" component={[NumberInput]} />
      <Submit>提交</Submit>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
