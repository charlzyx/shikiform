import { Field, Form, defineEffects, typed, useForm } from '@shikiform/react';
import { FormItem, Select } from '@shikiform/antd';

type Values = { province: string; city: string };

export const effects = defineEffects<Values>(({ reaction, watch }) => {
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
  const form = useForm<Values>({ initialValues: { province: '浙江', city: '杭州' }, effects: [effects] });
  const F = typed(form);
  return (
    <Form form={form}>
      <F.Field name="province" title="省" enum={['浙江', '广东']} decorator={[FormItem]}
        component={[Select, { allowClear: true, style: { width: 160 } }]} />
      <F.Field name="city" title="市" enum={['杭州', '广州']} decorator={[FormItem]} component={[Select, { style: { width: 160 } }]} />
    </Form>
  );
}
