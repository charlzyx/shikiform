import { useState } from 'react';
import { Form, Field, Submit, useForm } from 'shikiform';
import { FormItem, Input } from 'shikiform/ui';

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm({
    initialValues: { email: '' },
    validateTrigger: ['onSubmit'],
  });
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <Field
        name="email"
        decorator={<FormItem label="邮箱" />}
        rules={[{ required: true, message: '必填' }, { format: 'email', message: '邮箱格式不对' }]}
      >
        <Input type="email" />
      </Field>
      <Submit>提交</Submit>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
