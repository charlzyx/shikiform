import { useState } from 'react';
import { z } from 'zod';
import { Field, Form, useForm } from 'shikiform';
import { FormItem, Input, InputNumber, Submit } from 'shikiform/antd';

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
    validate: schema,
  });
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <Field name="name" title="姓名" required rules={{ minLength: 2, message: '至少 2 个字' }}
        decorator={[FormItem]} component={[Input]} />
      <Field name="email" title="邮箱" decorator={[FormItem]} component={[Input]} />
      <Field name="age" title="年龄" decorator={[FormItem]} component={[InputNumber]} />
      <Submit>提交</Submit>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
