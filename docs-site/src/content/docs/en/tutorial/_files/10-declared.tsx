import { enUS, Field, Form, Submit, Watch, useField, useForm, type Draft } from '@shikiform/react';

type Values = { more: boolean; nickname: string; code: string };

function TextInput() {
  const f = useField<string>();
  return (
    <p>
      <label htmlFor={f.id}>{f.title}：</label>
      <input id={f.id} value={f.value ?? ''} onChange={(e) => f.onChange(e.target.value)} onBlur={f.onBlur} />
      {f.description && <small style={{ marginLeft: 8, opacity: 0.7 }}>{f.description}</small>}
      {f.errors[0] && <small role="alert" style={{ color: 'crimson' }}> {f.errors[0]}</small>}
    </p>
  );
}

function More() {
  return (
    <Watch select={(d: Draft<Values>) => d.more.$value}>
      {(more) => more ? (
        <>
          <Field name="nickname" title="Nickname" rules={{ required: true, message: "Nickname is required" }} component={[TextInput]} />
          <Field name="code" title="Invite code" rules={{ required: true, message: "Invite code is required" }} component={[TextInput]} />
        </>
      ) : null}
    </Watch>
  );
}

export default function App() {
  const form = useForm<Values>({
    messages: enUS,
    initialValues: { more: false, nickname: '', code: '' },
  });
  return (
    <Form form={form}>
      <Field<Values, 'more'> name="more" title="More details">
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
      <More />
      <Submit>Submit</Submit>
      <Watch select={(d: Draft<Values>) => d.$errors}>
        {(errors) => (errors.length ? <ul aria-label="Form errors">{errors.map((message, index) => <li key={index}>{message}</li>)}</ul> : null)}
      </Watch>
    </Form>
  );
}
