import { useState } from 'react';
import { Form, Field, Submit, useForm } from 'shikiform';
import { FormItem, Input } from 'shikiform/ui';

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm({ initialValues: { name: '' } });
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <Field name="name" decorator={<FormItem label="姓名" />}>
        <Input placeholder="真实姓名" />
      </Field>
      <Submit>提交</Submit>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
