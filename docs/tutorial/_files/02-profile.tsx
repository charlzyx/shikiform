import { useState } from 'react';
import { Form, ObjectField, useForm } from 'shikiform';
import { TextField, SubmitButton } from './fields';

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm({ initialValues: { name: 'Ada', address: { city: '杭州' } } });
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <TextField name="name" label="姓名" />
      <ObjectField name="address">
        <TextField name="city" label="城市" />
      </ObjectField>
      <SubmitButton>提交</SubmitButton>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
