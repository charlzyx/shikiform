import { useState } from 'react';
import { enUS, Field, Form, Submit, useForm } from '@shikiform/react';

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm({ messages: enUS, initialValues: { name: '', email: '' } });
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <Field name="name" title="Name">
        {(f) => (
          <p>
            <label htmlFor={f.id}>{f.title}：</label>
            <input
              id={f.id}
              placeholder="Full name"
              value={f.value ?? ''}
              onChange={(e) => f.onChange(e.target.value)}
              onBlur={f.onBlur}
            />
          </p>
        )}
      </Field>
      <Field name="email" title="Email">
        {(f) => (
          <p>
            <label htmlFor={f.id}>{f.title}：</label>
            <input
              id={f.id}
              placeholder="ada@example.com"
              value={f.value ?? ''}
              onChange={(e) => f.onChange(e.target.value)}
              onBlur={f.onBlur}
            />
          </p>
        )}
      </Field>
      <Submit>Submit</Submit>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
