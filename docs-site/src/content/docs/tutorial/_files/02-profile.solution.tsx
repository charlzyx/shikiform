import { useState } from 'react';
import { Field, Form, ObjectField, useForm } from '@shikiform/react';
import { FormItem, Input, Submit } from '@shikiform/antd';

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm({ initialValues: { name: 'Ada', address: { city: '杭州', street: '' } } });
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <Field name="name" title="姓名" decorator={[FormItem]} component={[Input]} />
      <ObjectField name="address">
        <Field name="city" title="城市" decorator={[FormItem]} component={[Input]} />
        <Field name="street" title="街道" decorator={[FormItem]} component={[Input, { placeholder: '延安路' }]} />
      </ObjectField>
      <Submit>提交</Submit>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
