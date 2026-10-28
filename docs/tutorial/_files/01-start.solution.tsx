import { useState } from 'react';
import { Form, useForm } from 'shikiform';
import { TextField, SubmitButton } from './fields';

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm({ initialValues: { name: '', email: '' } });
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <TextField name="name" label="姓名" placeholder="真实姓名" />
      <TextField name="email" label="邮箱" type="email" placeholder="ada@example.com" />
      <SubmitButton>提交</SubmitButton>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
