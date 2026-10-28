import { useState } from 'react';
import { Form, defineEffects, useForm } from 'shikiform';
import { SwitchField, TextField, SubmitButton, FormErrors } from './fields';

export const effects = defineEffects<{ contact: boolean; email: string }>(({ reaction }) => {
  reaction((d) => {
    void d.contact.$value;
  });
});

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm({ initialValues: { contact: false, email: 'ada@example.com' }, effects: [effects] });
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <SwitchField name="contact" label="需要联系" />
      <TextField name="email" rules={[{ required: true, message: '必填' }]} label="邮箱" type="email" />
      <SubmitButton>提交</SubmitButton>
      <FormErrors />
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
