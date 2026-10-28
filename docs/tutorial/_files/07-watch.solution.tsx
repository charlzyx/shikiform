import { Form, defineEffects, useForm } from 'shikiform';
import { SelectField } from './fields';

const PROVINCES = [
  { label: '浙江', value: '浙江' },
  { label: '广东', value: '广东' },
];
const CITIES = [
  { label: '杭州', value: '杭州' },
  { label: '广州', value: '广州' },
];

export const effects = defineEffects<{ province: string; city: string }>(({ reaction, watch }) => {
  reaction((d) => {
    d.city.$disabled = !d.province.$value;
  });
  watch(
    (d) => d.province.$value,
    (d) => {
      d.city.$value = '';
    },
  );
});

export default function App() {
  const form = useForm<{ province: string; city: string }>({
    initialValues: { province: '浙江', city: '杭州' },
    effects: [effects],
  });
  return (
    <Form form={form}>
      <SelectField name="province" options={PROVINCES} label="省" />
      <SelectField name="city" options={CITIES} label="市" />
    </Form>
  );
}
