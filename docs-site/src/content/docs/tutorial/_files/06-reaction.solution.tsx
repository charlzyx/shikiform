import { useState } from 'react';
import { Field, Form, defineEffects, useForm } from '@shikiform/react';
import { FormItem, InputNumber, Submit } from '@shikiform/antd';

type Values = { price: number; qty: number; amount: number };

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
      <Field name="price" title="单价" decorator={[FormItem]} component={[InputNumber]} />
      <Field name="qty" title="数量" decorator={[FormItem]} component={[InputNumber]} />
      <Field name="amount" title="金额" description="reaction 写 $value：阅读态，默认仍提交" decorator={[FormItem]} component={[InputNumber]} />
      <Submit>提交</Submit>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
