import { useState } from 'react';
import { Form, Field, ObjectField, Submit, useForm } from 'shikiform';
import { FormItem, Input } from 'shikiform/ui';

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm({ initialValues: { name: 'Ada', address: { city: '杭州', street: '' } } });
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <Field name="name" decorator={<FormItem label="姓名" />}>
        <Input />
      </Field>
      <ObjectField name="address">
        <Field name="city" decorator={<FormItem label="城市" />}>
          <Input />
        </Field>
        <Field name="street" decorator={<FormItem label="街道" />}>
          <Input placeholder="延安路" />
        </Field>
      </ObjectField>
      <Submit>提交</Submit>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
