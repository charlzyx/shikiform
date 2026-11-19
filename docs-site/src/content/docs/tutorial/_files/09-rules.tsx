// 起始文件：校验规则还没接上。按本章补上 useForm 的 validate: schema，
// 给姓名、邮箱、年龄加上 required，姓名再加 rules={{ minLength: 2, message: '至少 2 个字' }}。
import { useState } from 'react';
import { z } from 'zod';
import { Field, Form, Submit, useField, useForm } from '@shikiform/react';

export const schema = z.object({
  name: z.string(),
  email: z.string().email('邮箱格式不对').or(z.literal('')),
  age: z.number().min(18, '需要年满 18').nullable(),
});

function TextInput() {
  const f = useField<string>();
  return (
    <p>
      <label htmlFor={f.id}>{f.title}：</label>
      <input id={f.id} value={f.value ?? ''} onChange={(e) => f.onChange(e.target.value)} onBlur={f.onBlur} />
      {f.errors[0] && <small role="alert" style={{ color: 'crimson' }}> {f.errors[0]}</small>}
    </p>
  );
}

function NumberInput() {
  const f = useField<number | null>();
  return (
    <p>
      <label htmlFor={f.id}>{f.title}：</label>
      <input
        id={f.id}
        type="number"
        value={f.value ?? ''}
        onChange={(e) => f.onChange(e.target.value === '' ? null : Number(e.target.value))}
        onBlur={f.onBlur}
      />
      {f.errors[0] && <small role="alert" style={{ color: 'crimson' }}> {f.errors[0]}</small>}
    </p>
  );
}

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm<{ name: string; email: string; age: number | null }>({
    initialValues: { name: '', email: '', age: 0 },
    validateTrigger: ['onBlur', 'onSubmit'],
  });
  void schema;
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <Field name="name" title="姓名" component={[TextInput]} />
      <Field name="email" title="邮箱" component={[TextInput]} />
      <Field name="age" title="年龄" component={[NumberInput]} />
      <Submit>提交</Submit>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
