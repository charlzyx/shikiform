import { useState } from 'react';
import { Form, defineEffects, useForm } from 'shikiform';
import { NumberField, SubmitButton } from './fields';

export const effects = defineEffects<{ price: number; qty: number; amount: number }>(({ reaction }) => {
  reaction((d) => {
    const amount = (d.price.$value || 0) * (d.qty.$value || 0);
    d.amount.$value = amount;
  });
});

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm({ initialValues: { price: 10, qty: 2, amount: 0 }, effects: [effects] });
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <NumberField name="price" label="单价" />
      <NumberField name="qty" label="数量" />
      <NumberField name="amount" label="金额" help="reaction 写 $value，只读，默认仍提交" />
      <SubmitButton>提交</SubmitButton>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
