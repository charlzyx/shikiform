import { useState } from 'react';
import { Form, useForm } from 'shikiform';
import { NumberField, SubmitButton } from './fields';

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm({ initialValues: { price: 10, qty: 2, amount: 0 } });
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <NumberField name="price" label="单价" />
      <NumberField name="qty" label="数量" />
      <NumberField name="amount" label="金额" />
      <SubmitButton>提交</SubmitButton>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
