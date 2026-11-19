import { useState } from 'react';
import { Field, Form, ObjectField, Reset, Submit, useField, useForm } from '@shikiform/react';

function TextInput({ type = 'text' }: { type?: string }) {
  const f = useField<string>();
  return (
    <p>
      <label htmlFor={f.id}>{f.title}：</label>
      <input
        id={f.id}
        type={type}
        value={f.value ?? ''}
        onChange={(e) => f.onChange(e.target.value)}
        onBlur={f.onBlur}
      />
      {f.errors[0] && <small role="alert" style={{ color: 'crimson' }}> {f.errors[0]}</small>}
    </p>
  );
}

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm({ initialValues: { profile: { name: 'Ada' }, password: '', confirmPassword: '' } });
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <ObjectField name="profile">
        <Field name="name" title="昵称" component={[TextInput]} />
      </ObjectField>
      <Field
        name="password"
        title="密码"
        required
        rules={{ minLength: 8, message: '至少 8 位' }}
        component={[TextInput, { type: 'password' }]}
      />
      <Field
        name="confirmPassword"
        title="确认密码"
        omit
        rules={[{ validator: (value, ctx) => (value === ctx.record.password ? null : '两次密码不一致') }]}
        component={[TextInput, { type: 'password' }]}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <Submit>提交</Submit>
        <Reset afterReset={() => setPayload('')}>重置表单</Reset>
      </div>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
