import { useState } from 'react';
import { enUS, Field, Form, Submit, Watch, defineEffects, useForm, type Draft } from '@shikiform/react';

type Values = { contact: boolean; email: string };

export const effects = defineEffects<Values>(({ reaction }) => {
  reaction((d) => {
    void d.contact.$value;
  });
});

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm<Values>({ messages: enUS, initialValues: { contact: false, email: 'ada@example.com' }, effects: [effects] });
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <Field<Values, 'contact'> name="contact" title="Contact required">
        {(f) => (
          <p>
            <label htmlFor={f.id}>
              <input
                id={f.id}
                type="checkbox"
                checked={Boolean(f.value)}
                onChange={(e) => f.onChange(e.target.checked)}
              />{' '}
              {f.title}
            </label>
          </p>
        )}
      </Field>
      <Field<Values, 'email'> name="email" title="Email" required>
        {(f) => (
          <p>
            <label htmlFor={f.id}>{f.title}：</label>
            <input
              id={f.id}
              value={f.value ?? ''}
              onChange={(e) => f.onChange(e.target.value)}
              onBlur={f.onBlur}
            />
            {f.errors[0] && <small role="alert" style={{ color: 'crimson' }}> {f.errors[0]}</small>}
          </p>
        )}
      </Field>
      <Submit>Submit</Submit>
      <Watch select={(d: Draft<Values>) => d.$errors}>
        {(errors) => (errors.length ? <p role="alert">Errors:{errors.join('；')}</p> : null)}
      </Watch>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
