import { enUS, Form, defineEffects, typed, useField, useForm } from '@shikiform/react';

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
        <option value="">{allowClear ? "(none)" : "Choose an option"}</option>
        {f.options.map((opt) => (
          <option key={String(opt.value)} value={String(opt.value)}>
            {opt.label}
          </option>
        ))}
      </select>
    </p>
  );
}

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
  const form = useForm<Values>({ messages: enUS, initialValues: { province: "Zhejiang", city: "Hangzhou" }, effects: [effects] });
  const F = typed(form);
  return (
    <Form form={form}>
      <F.Field name="province" title="Province" enum={["Zhejiang", "Guangdong"]} component={[SelectInput, { allowClear: true }]} />
      <F.Field name="city" title="City" enum={["Hangzhou", "Guangzhou"]} component={[SelectInput]} />
    </Form>
  );
}
