import { Form, defineEffects, typed, useField, useForm } from '@shikiform/react';

type Values = { province: string; city: string };

function SelectInput({ allowClear }: { allowClear?: boolean }) {
  const f = useField<string>();
  return (
    <p>
      <label htmlFor={f.id}>{f.title}：</label>
      <select
        id={f.id}
        value={f.value ?? ''}
        disabled={f.disabled}
        onChange={(e) => f.onChange(e.target.value)}
        onBlur={f.onBlur}
      >
        <option value="">{allowClear ? '（未选择）' : '请选择'}</option>
        {f.options.map((opt) => (
          <option key={String(opt.value)} value={String(opt.value)}>
            {opt.label}
          </option>
        ))}
      </select>
    </p>
  );
}

export const effects = defineEffects<Values>(({ reaction }) => {
  reaction((d) => {
    d.city.$disabled = !d.province.$value;
    d.city.$value = '';
  });
});

export default function App() {
  const form = useForm<Values>({ initialValues: { province: '浙江', city: '杭州' }, effects: [effects] });
  const F = typed(form);
  return (
    <Form form={form}>
      <F.Field name="province" title="省" enum={['浙江', '广东']} component={[SelectInput, { allowClear: true }]} />
      <F.Field name="city" title="市" enum={['杭州', '广州']} component={[SelectInput]} />
    </Form>
  );
}
