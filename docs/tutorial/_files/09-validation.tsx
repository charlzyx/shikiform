import { useState } from 'react';
import { Form, useForm } from 'shikiform';
import { TextField, NumberField, SubmitButton } from './fields';
import { z } from 'zod';

export const schema = z.object({
  name: z.string(),
  email: z.string().email('邮箱格式不对'),
  age: z.number().min(18, '需要年满 18'),
});

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm({
    initialValues: { name: '', email: '', age: 0 },
    validateTrigger: ['onBlur', 'onSubmit'],
  });
  void schema;
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <TextField name="name" label="姓名" />
      <TextField name="email" label="邮箱" type="email" />
      <NumberField name="age" label="年龄" />
      <SubmitButton>提交</SubmitButton>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
