import { useState } from 'react';
import { Field, Form, useForm } from 'shikiform';
import { FormItem, Input, Submit } from 'shikiform/antd';

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm({ initialValues: { name: '' } });
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <Field name="name" title="姓名" decorator={[FormItem]} component={[Input, { placeholder: '真实姓名' }]} />
      <Submit>提交</Submit>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
