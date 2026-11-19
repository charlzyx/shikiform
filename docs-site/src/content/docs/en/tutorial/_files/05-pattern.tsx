import { enUS, Field, Form, defineEffects, useForm } from '@shikiform/react';

type Mode = 'editable' | 'disabled' | 'readOnly';
type Values = { mode: Mode; name: string };

const MODES: { label: string; value: Mode }[] = [
  { label: "Editable", value: 'editable' },
  { label: "Disabled", value: 'disabled' },
  { label: "Read only", value: 'readOnly' },
];

export const effects = defineEffects<Values>(({ reaction }) => {
  reaction((d) => {
    void d.mode.$value;
  });
});

export default function App() {
  const form = useForm<Values>({ messages: enUS, initialValues: { mode: 'editable', name: 'Ada' }, effects: [effects] });
  return (
    <Form form={form}>
      <Field<Values, 'mode'> name="mode" title="Name field state" enum={MODES}>
        {(f) => (
          <p>
            <label htmlFor={f.id}>{f.title}：</label>
            <select id={f.id} value={f.value} onChange={(e) => f.onChange(e.target.value as Mode)}>
              {f.options.map((opt) => (
                <option key={String(opt.value)} value={String(opt.value)}>
                  {opt.label}
                </option>
              ))}
            </select>
          </p>
        )}
      </Field>
      <Field<Values, 'name'> name="name" title="Name">
        {(f) => (
          <p>
            <label htmlFor={f.id}>{f.title}：</label>
            {f.readOnly ? (
              <span>{f.value || '-'}</span>
            ) : (
              <input
                id={f.id}
                value={f.value ?? ''}
                disabled={f.disabled}
                onChange={(e) => f.onChange(e.target.value)}
                onBlur={f.onBlur}
              />
            )}
          </p>
        )}
      </Field>
    </Form>
  );
}
