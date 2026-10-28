import { useState } from 'react';
import { Form, Field, Submit, defineEffects, useForm } from 'shikiform';
import { FormItem, Input, Switch } from 'shikiform/ui';

const effects = defineEffects<{ contact: boolean; email: string }>(({ reaction }) => {
  reaction((d) => {
    d.email.$visible = d.contact.$value;
  });
});

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm({ initialValues: { contact: false, email: 'ada@example.com' }, effects: [effects] });
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <Field name="contact" decorator={<FormItem label="需要联系" inline />}>
        <Switch />
      </Field>
      <Field name="email" decorator={<FormItem label="邮箱" />} rules={[{ required: true, message: '必填' }]}>
        <Input type="email" />
      </Field>
      <Submit>提交</Submit>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
