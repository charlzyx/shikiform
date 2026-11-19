import { useState } from 'react';
import { Field, Form, Submit, useForm } from '@shikiform/react';

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm({ initialValues: { name: '', email: '' } });
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <Field name="name" title="姓名">
        {(f) => (
          <p>
            <label htmlFor={f.id}>{f.title}：</label>
            <input
              id={f.id}
              placeholder="真实姓名"
              value={f.value ?? ''}
              onChange={(e) => f.onChange(e.target.value)}
              onBlur={f.onBlur}
            />
          </p>
        )}
      </Field>
      <Field name="email" title="邮箱">
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
      <Submit>提交</Submit>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
