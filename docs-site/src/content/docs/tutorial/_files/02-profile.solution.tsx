import { useState } from 'react';
import { Field, Form, ObjectField, Submit, useField, useForm } from '@shikiform/react';

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
  const form = useForm({ initialValues: { name: 'Ada', address: { city: '杭州', street: '' } } });
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <Field name="name" title="姓名" component={[TextInput]} />
      <ObjectField name="address">
        <Field name="city" title="城市" component={[TextInput]} />
        <Field name="street" title="街道" component={[TextInput, { placeholder: '延安路' }]} />
      </ObjectField>
      <Submit>提交</Submit>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
