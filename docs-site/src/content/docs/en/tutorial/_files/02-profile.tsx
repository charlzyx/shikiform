import { useState } from 'react';
import { enUS, Field, Form, ObjectField, Submit, useField, useForm } from '@shikiform/react';

function TextInput({ placeholder }: { placeholder?: string }) {
  const f = useField<string>();
  return (
    <p>
      <label htmlFor={f.id}>{f.title}：</label>
      <input
        id={f.id}
        placeholder={placeholder}
        value={f.value ?? ''}
        onChange={(e) => f.onChange(e.target.value)}
        onBlur={f.onBlur}
      />
    </p>
  );
}

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm({ messages: enUS, initialValues: { name: 'Ada', address: { city: "Hangzhou" } } });
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <Field name="name" title="Name" component={[TextInput]} />
      <ObjectField name="address">
        <Field name="city" title="City" component={[TextInput]} />
      </ObjectField>
      <Submit>Submit</Submit>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
