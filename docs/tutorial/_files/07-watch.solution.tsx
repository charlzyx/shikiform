import { Form, Field, defineEffects, useForm } from 'shikiform';
import { FormItem, Select } from 'shikiform/ui';

const PROVINCES = [
  { label: '浙江', value: '浙江' },
  { label: '广东', value: '广东' },
];
const CITIES = [
  { label: '杭州', value: '杭州' },
  { label: '广州', value: '广州' },
];

const effects = defineEffects<{ province: string; city?: string }>(({ reaction, watch }) => {
  reaction((d) => {
    d.city.$disabled = !d.province.$value;
  });
  watch(
    (d) => d.province,
    (d) => {
      d.city.$value = undefined;
    },
  );
});

export default function App() {
  const form = useForm({
    initialValues: { province: '浙江', city: '杭州' },
    effects: [effects],
  });
  return (
    <Form form={form}>
      <Field name="province" decorator={<FormItem label="省" />} enum={PROVINCES}>
        <Select />
      </Field>
      <Field name="city" decorator={<FormItem label="市" />} enum={CITIES}>
        <Select />
      </Field>
    </Form>
  );
}
