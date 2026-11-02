import { useState } from 'react';
import { Field, Form, useForm } from 'shikiform';
import { FormItem, InputNumber, Submit } from 'shikiform/antd';

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm({ initialValues: { price: 10, qty: 2, amount: 0 } });
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <Field name="price" title="单价" decorator={[FormItem]} component={[InputNumber]} />
      <Field name="qty" title="数量" decorator={[FormItem]} component={[InputNumber]} />
      <Field name="amount" title="金额" decorator={[FormItem]} component={[InputNumber]} />
      <Submit>提交</Submit>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
