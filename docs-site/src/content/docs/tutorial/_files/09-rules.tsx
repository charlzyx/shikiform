// 起始文件：校验规则还没接上。按本章补上 useForm 的 validate: schema，
// 给姓名、邮箱、年龄加上 required，姓名再加 rules={{ minLength: 2, message: '至少 2 个字' }}。
import { useState } from 'react';
import { z } from 'zod';
import { Field, Form, useForm } from '@shikiform/react';
import { FormItem, Input, InputNumber, Submit } from '@shikiform/antd';

export const schema = z.object({
  name: z.string(),
  email: z.string().email('邮箱格式不对').or(z.literal('')),
  age: z.number().min(18, '需要年满 18').nullable(),
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
      <Field name="name" title="姓名" decorator={[FormItem]} component={[Input]} />
      <Field name="email" title="邮箱" decorator={[FormItem]} component={[Input]} />
      <Field name="age" title="年龄" decorator={[FormItem]} component={[InputNumber]} />
      <Submit>提交</Submit>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
