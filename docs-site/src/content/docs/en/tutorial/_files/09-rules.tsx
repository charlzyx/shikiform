// Exercise: connect validate: schema to useForm.
// Mark name, email and age required, and give name a minLength of 2.
import { useState } from 'react';
import { z } from 'zod';
import { enUS, Field, Form, Submit, useField, useForm } from '@shikiform/react';

export const schema = z.object({
  name: z.string(),
  email: z.string().email("Invalid email address").or(z.literal('')),
  age: z.number().min(18, "Must be at least 18").nullable(),
});

function TextInput() {
  const f = useField<string>();
  return (
    <p>
      <label htmlFor={f.id}>{f.title}：</label>
      <input id={f.id} value={f.value ?? ''} onChange={(e) => f.onChange(e.target.value)} onBlur={f.onBlur} />
      {f.errors[0] && <small role="alert" style={{ color: 'crimson' }}> {f.errors[0]}</small>}
    </p>
  );
}

function NumberInput() {
  const f = useField<number | null>();
  return (
    <p>
      <label htmlFor={f.id}>{f.title}：</label>
      <input
        id={f.id}
        type="number"
        value={f.value ?? ''}
        onChange={(e) => f.onChange(e.target.value === '' ? null : Number(e.target.value))}
        onBlur={f.onBlur}
      />
      {f.errors[0] && <small role="alert" style={{ color: 'crimson' }}> {f.errors[0]}</small>}
    </p>
  );
}

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm<{ name: string; email: string; age: number | null }>({
    messages: enUS,
    initialValues: { name: '', email: '', age: 0 },
    validateTrigger: ['onBlur', 'onSubmit'],
  });
  void schema;
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <Field name="name" title="Name" component={[TextInput]} />
      <Field name="email" title="Email" component={[TextInput]} />
      <Field name="age" title="Age" component={[NumberInput]} />
      <Submit>Submit</Submit>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
