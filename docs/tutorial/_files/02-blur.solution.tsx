import { useState } from 'react';
import { Form, useForm } from 'shikiform';
import { TextField, SubmitButton } from './fields';

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm({
    initialValues: { email: '' },
    validateTrigger: ['onBlur', 'onSubmit'],
  });
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <TextField name="email" rules={[{ required: true, message: '必填' }, { format: 'email', message: '邮箱格式不对' }]} label="邮箱" type="email" />
      <SubmitButton>提交</SubmitButton>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
