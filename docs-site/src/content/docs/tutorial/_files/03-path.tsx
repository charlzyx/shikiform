import { useState } from 'react';
import { Field, Form, ObjectField, useForm } from 'shikiform';
import { FormItem, Input, Submit } from 'shikiform/antd';

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm({ initialValues: { profile: { name: 'Ada' }, password: '', confirmPassword: '' } });
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <ObjectField name="profile">
        <Field name="name" title="昵称" decorator={[FormItem]} component={[Input]} />
      </ObjectField>
      <Field name="password" title="密码" required rules={{ minLength: 8, message: '至少 8 位' }}
        decorator={[FormItem]} component={[Input.Password]} />
      <Field name="confirmPassword" title="确认密码" decorator={[FormItem]} component={[Input.Password]} />
      <Submit>提交</Submit>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
