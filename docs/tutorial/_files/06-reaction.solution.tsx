import { useState } from 'react';
import { Form, Field, Submit, defineEffects, useForm } from 'shikiform';
import { FormItem, NumberInput } from 'shikiform/ui';

const effects = defineEffects<{ price: number; qty: number; amount?: number }>(({ reaction }) => {
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
      <Field name="price" decorator={<FormItem label="单价" />}>
        <NumberInput />
      </Field>
      <Field name="qty" decorator={<FormItem label="数量" />}>
        <NumberInput />
      </Field>
      <Field name="amount" decorator={<FormItem label="金额" help="reaction 写 $value，只读，默认不提交" />}>
        <NumberInput />
      </Field>
      <Submit>提交</Submit>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
