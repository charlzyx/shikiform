import { useState } from 'react';
import { Field, Form, Submit, useField, useForm } from '@shikiform/react';

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

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm({ initialValues: { price: 10, qty: 2, amount: 0 } });
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <Field name="price" title="单价" component={[NumberInput]} />
      <Field name="qty" title="数量" component={[NumberInput]} />
      <Field name="amount" title="金额" component={[NumberInput]} />
      <Submit>提交</Submit>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
