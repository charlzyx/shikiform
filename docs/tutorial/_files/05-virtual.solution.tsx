import { useState } from 'react';
import { Form, useForm } from 'shikiform';
import { TextField, SubmitButton } from './fields';

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm({ initialValues: { password: '', confirmPassword: '' } });
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <TextField name="password" rules={[{ required: true, message: '必填' }, { minLength: 8, message: '至少 8 位' }]} label="密码" type="password" />
      <TextField name="confirmPassword" virtual rules={[{ validator: (value, ctx) => (value === ctx.record.password ? null : '两次密码不一致') }]} label="确认密码" type="password" />
      <SubmitButton>提交</SubmitButton>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
