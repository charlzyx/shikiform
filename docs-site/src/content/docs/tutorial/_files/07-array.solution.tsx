import { useState, type ReactNode } from 'react';
import { Button } from 'antd';
import { ArrayField, Field, Form, defineEffects, useArray, useForm, useIndex } from '@shikiform/react';
import { FormItem, FormLayout, Input, InputNumber, Submit } from '@shikiform/antd';

type Row = { id: string; name: string; price: number; qty: number; total: number };
type Values = { items: Row[] };

function createRow(): Row {
  return { id: crypto.randomUUID(), name: '', price: 0, qty: 1, total: 0 };
}

function RemoveButton() {
  const array = useArray<Row>();
  const index = useIndex();
  return <Button danger onClick={() => array.remove(index)}>删除</Button>;
}

function ItemList({ children }: { children?: ReactNode }) {
  const array = useArray<Row>();
  return (
    <>
      {children}
      <Button onClick={() => array.push(createRow())}>添加一行</Button>{' '}
    </>
  );
}

export const effects = defineEffects<Values>(({ reaction }) => {
  reaction.each(
    (d) => d.items,
    (row) => {
      const total = (row.price.$value || 0) * (row.qty.$value || 0);
      row.total.$value = total;
    },
  );
});

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm<Values>({
    initialValues: { items: [{ id: 'row-1', name: '贴纸', price: 2, qty: 4, total: 0 }] },
    effects: [effects],
  });
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <ArrayField name="items" rowKey="id" component={ItemList}>
        {({ index }) => (
          <fieldset>
            <legend>第 {index + 1} 行</legend>
            <FormLayout layout="inline" feedbackLayout="terse">
              <Field name="name" title="名称" decorator={[FormItem]} component={[Input, { style: { width: 100 } }]} />
              <Field name="price" title="单价" decorator={[FormItem]} component={[InputNumber]} />
              <Field name="qty" title="数量" decorator={[FormItem]} component={[InputNumber]} />
              <Field name="total" title="小计" decorator={[FormItem]} component={[InputNumber]} />
              <RemoveButton />
            </FormLayout>
          </fieldset>
        )}
      </ArrayField>
      <Submit>提交</Submit>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
