import { Field, Form, defineEffects, useForm } from '@shikiform/react';
import { FormItem, Input, Select } from '@shikiform/antd';

type Mode = 'editable' | 'disabled' | 'readOnly';
type Values = { mode: Mode; name: string };

const MODES: { label: string; value: Mode }[] = [
  { label: '可编辑', value: 'editable' },
  { label: '禁用', value: 'disabled' },
  { label: '只读', value: 'readOnly' },
];

export const effects = defineEffects<Values>(({ reaction }) => {
  reaction((d) => {
    const mode = d.mode.$value;
    d.name.$disabled = mode === 'disabled';
    d.name.$readOnly = mode === 'readOnly';
  });
});

export default function App() {
  const form = useForm<Values>({ initialValues: { mode: 'editable', name: 'Ada' }, effects: [effects] });
  return (
    <Form form={form}>
      <Field name="mode" title="姓名的状态" enum={MODES} decorator={[FormItem]} component={[Select, { style: { width: 160 } }]} />
      <Field name="name" title="姓名" decorator={[FormItem]} component={[Input]} />
    </Form>
  );
}
