import { useState } from 'react';
import { Form, Field, Submit, useForm } from 'shikiform';
import { FormItem, Input, NumberInput } from 'shikiform/ui';
import { zodResolver } from 'shikiform/zod';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email('邮箱格式不对'),
  age: z.number().min(18, '需要年满 18'),
});

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm({
    initialValues: { name: '', email: '', age: undefined as number | undefined },
    validateTrigger: ['onBlur', 'onSubmit'],
    resolver: zodResolver(schema),
  });
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <Field name="name" decorator={<FormItem label="姓名" />} rules={[{ required: true, message: '必填' }, { minLength: 2, message: '至少 2 个字' }]}>
        <Input />
      </Field>
      <Field name="email" decorator={<FormItem label="邮箱" />}>
        <Input type="email" />
      </Field>
      <Field name="age" decorator={<FormItem label="年龄" />}>
        <NumberInput />
      </Field>
      <Submit>提交</Submit>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
