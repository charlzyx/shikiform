import { useState } from 'react';
import { Form, Field, Submit, useForm } from 'shikiform';
import { FormItem, Input } from 'shikiform/ui';

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm({ initialValues: { password: '', confirmPassword: '' } });
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <Field name="password" decorator={<FormItem label="密码" />} rules={[{ required: true, message: '必填' }, { minLength: 8, message: '至少 8 位' }]}>
        <Input type="password" />
      </Field>
      <Field
        name="confirmPassword"
        virtual
        decorator={<FormItem label="确认密码" />}
        validator={(value, ctx) => (value === ctx.record.password ? null : '两次密码不一致')}
      >
        <Input type="password" />
      </Field>
      <Submit>提交</Submit>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
