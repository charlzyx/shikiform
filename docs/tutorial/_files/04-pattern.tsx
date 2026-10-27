import { Form, Field, defineEffects, useForm } from 'shikiform';
import { FormItem, Input, Select } from 'shikiform/ui';

const MODES = [
  { label: '可编辑', value: 'editable' },
  { label: '禁用', value: 'disabled' },
  { label: '只读', value: 'readOnly' },
  { label: '阅读态', value: 'readPretty' },
];

const effects = defineEffects<{ mode: string; name: string }>(({ reaction }) => {
  reaction((d) => {
    void d.mode.$value;
  });
});

export default function App() {
  const form = useForm({ initialValues: { mode: 'editable', name: 'Ada' }, effects: [effects] });
  return (
    <Form form={form}>
      <Field name="mode" decorator={<FormItem label="姓名的 pattern" />} enum={MODES}>
        <Select />
      </Field>
      <Field name="name" decorator={<FormItem label="姓名" />}>
        <Input />
      </Field>
    </Form>
  );
}
