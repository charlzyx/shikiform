import { useState, type ReactNode } from 'react';
import { ArrayField, Field, Form, Submit, defineEffects, useArrayField, useField, useForm, useIndex } from '@shikiform/react';

type Row = { id: string; name: string; price: number; qty: number; total: number };
type Values = { items: Row[] };

let nextRowId = 2;
function createRow(): Row {
  return { id: `row-${nextRowId++}`, name: '', price: 0, qty: 1, total: 0 };
}

function TextInput({ width = 100 }: { width?: number }) {
  const f = useField<string>();
  return (
    <label htmlFor={f.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {f.title}
      <input
        id={f.id}
        style={{ width }}
        value={f.value ?? ''}
        onChange={(e) => f.onChange(e.target.value)}
        onBlur={f.onBlur}
      />
    </label>
  );
}

function NumberInput() {
  const f = useField<number>();
  return (
    <label htmlFor={f.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {f.title}
      <input
        id={f.id}
        type="number"
        style={{ width: 72 }}
        value={f.value ?? 0}
        onChange={(e) => f.onChange(Number(e.target.value))}
        onBlur={f.onBlur}
      />
    </label>
  );
}

function RemoveButton() {
  const array = useArrayField<Row>();
  const index = useIndex();
  return <button type="button" onClick={() => array.remove(index)}>删除</button>;
}

function ItemList({ children }: { children?: ReactNode }) {
  const array = useArrayField<Row>();
  return (
    <>
      {children}
      <button type="button" onClick={() => array.push(createRow())}>添加一行</button>{' '}
    </>
  );
}

export const effects = defineEffects<Values>(({ reaction, draft }) => {
  reaction.each(draft.items,
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
          <fieldset style={{ marginBottom: 8 }}>
            <legend>第 {index + 1} 行</legend>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <Field name="name" title="名称" component={[TextInput, { width: 100 }]} />
              <Field name="price" title="单价" component={[NumberInput]} />
              <Field name="qty" title="数量" component={[NumberInput]} />
              <Field name="total" title="小计" component={[NumberInput]} />
              <RemoveButton />
            </div>
          </fieldset>
        )}
      </ArrayField>
      <Submit>提交</Submit>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
