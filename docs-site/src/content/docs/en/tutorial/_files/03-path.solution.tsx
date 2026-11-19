import { useState } from 'react';
import { enUS, Field, Form, ObjectField, Reset, Submit, useField, useForm } from '@shikiform/react';

function TextInput({ type = 'text' }: { type?: string }) {
  const f = useField<string>();
  return (
    <p>
      <label htmlFor={f.id}>{f.title}：</label>
      <input
        id={f.id}
        type={type}
        value={f.value ?? ''}
        onChange={(e) => f.onChange(e.target.value)}
        onBlur={f.onBlur}
      />
      {f.errors[0] && <small role="alert" style={{ color: 'crimson' }}> {f.errors[0]}</small>}
    </p>
  );
}

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm({ messages: enUS, initialValues: { profile: { name: 'Ada' }, password: '', confirmPassword: '' } });
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <ObjectField name="profile">
        <Field name="name" title="Nickname" component={[TextInput]} />
      </ObjectField>
      <Field
        name="password"
        title="Password"
        required
        rules={{ minLength: 8, message: "At least 8 characters" }}
        component={[TextInput, { type: 'password' }]}
      />
      <Field
        name="confirmPassword"
        title="Confirm password"
        omit
        rules={[{ validator: (value, ctx) => (value === ctx.record.password ? null : "Passwords do not match") }]}
        component={[TextInput, { type: 'password' }]}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <Submit>Submit</Submit>
        <Reset afterReset={() => setPayload('')}>Reset form</Reset>
      </div>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
