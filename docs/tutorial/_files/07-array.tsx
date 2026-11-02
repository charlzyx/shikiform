import { useState } from 'react';
import { Button } from 'antd';
import { ArrayField, Field, Form, useForm } from 'shikiform';
import { FormItem, FormLayout, Input, InputNumber, Submit } from 'shikiform/antd';

type Row = { id: string; name: string; price: number; qty: number; total: number };
type Values = { items: Row[] };

function createRow(): Row {
  return { id: crypto.randomUUID(), name: '', price: 0, qty: 1, total: 0 };
}

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm<Values>({
    initialValues: { items: [{ id: 'row-1', name: '贴纸', price: 2, qty: 4, total: 0 }] },
  });
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <ArrayField name="items" rowKey="id">
        {({ index }) => (
          <fieldset>
            <legend>第 {index + 1} 行</legend>
            <FormLayout layout="inline" feedbackLayout="terse">
              <Field name="name" title="名称" decorator={[FormItem]} component={[Input, { style: { width: 100 } }]} />
              <Field name="price" title="单价" decorator={[FormItem]} component={[InputNumber]} />
              <Field name="qty" title="数量" decorator={[FormItem]} component={[InputNumber]} />
              <Field name="total" title="小计" decorator={[FormItem]} component={[InputNumber]} />
              <Button danger onClick={() => form.removeArray('items', index)}>删除</Button>
            </FormLayout>
          </fieldset>
        )}
      </ArrayField>
      <Button onClick={() => form.pushArray('items', createRow())}>添加一行</Button>{' '}
      <Submit>提交</Submit>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
