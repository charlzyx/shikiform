import { Form, defineEffects, useForm } from 'shikiform';
import type { Pattern } from 'shikiform/core';
import { SelectField, TextField } from './fields';

const MODES = [
  { label: '可编辑', value: 'editable' },
  { label: '禁用', value: 'disabled' },
  { label: '只读', value: 'readOnly' },
  { label: '阅读态', value: 'readPretty' },
];

export const effects = defineEffects<{ mode: Pattern; name: string }>(({ reaction }) => {
  reaction((d) => {
    const mode = d.mode.$value;
    if (mode) d.name.$pattern = mode;
  });
});

export default function App() {
  const form = useForm<{ mode: Pattern; name: string }>({ initialValues: { mode: 'editable', name: 'Ada' }, effects: [effects] });
  return (
    <Form form={form}>
      <SelectField name="mode" options={MODES} label="姓名的 pattern" />
      <TextField name="name" label="姓名" />
    </Form>
  );
}
