import { Field, Form, defineEffects, useForm, type Pattern } from '@shikiform/react';
import { FormItem, Input, Select } from '@shikiform/antd';

type Values = { mode: Pattern; name: string };

const MODES: { label: string; value: Pattern }[] = [
  { label: '可编辑', value: 'editable' },
  { label: '禁用', value: 'disabled' },
  { label: '只读', value: 'readOnly' },
  { label: '阅读态', value: 'readPretty' },
];

export const effects = defineEffects<Values>(({ reaction }) => {
  reaction((d) => {
    const mode = d.mode.$value;
    if (mode) d.name.$pattern = mode;
  });
});

export default function App() {
  const form = useForm<Values>({ initialValues: { mode: 'editable', name: 'Ada' }, effects: [effects] });
  return (
    <Form form={form}>
      <Field name="mode" title="姓名的 pattern" enum={MODES} decorator={[FormItem]} component={[Select, { style: { width: 160 } }]} />
      <Field name="name" title="姓名" decorator={[FormItem]} component={[Input]} />
    </Form>
  );
}
