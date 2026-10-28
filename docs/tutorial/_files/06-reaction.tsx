import { useState } from 'react';
import { Form, Field, Submit, useForm } from 'shikiform';
import { FormItem, NumberInput } from 'shikiform/ui';

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm({ initialValues: { price: 10, qty: 2, amount: 0 } });
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <Field name="price" decorator={<FormItem label="单价" />}>
        <NumberInput />
      </Field>
      <Field name="qty" decorator={<FormItem label="数量" />}>
        <NumberInput />
      </Field>
      <Field name="amount" decorator={<FormItem label="金额" />}>
        <NumberInput />
      </Field>
      <Submit>提交</Submit>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
