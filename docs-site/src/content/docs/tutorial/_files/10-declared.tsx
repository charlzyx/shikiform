import { Field, Form, Submit, Watch, useField, useForm, type Draft } from '@shikiform/react';

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
          <Field name="nickname" title="昵称" rules={{ required: true, message: '昵称必填' }} component={[TextInput]} />
          <Field name="code" title="邀请码" rules={{ required: true, message: '邀请码必填' }} component={[TextInput]} />
        </>
      ) : null}
    </Watch>
  );
}

export default function App() {
  const form = useForm<Values>({
    initialValues: { more: false, nickname: '', code: '' },
  });
  return (
    <Form form={form}>
      <Field<Values, 'more'> name="more" title="填写更多">
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
      <Submit>提交</Submit>
      <Watch select={(d: Draft<Values>) => d.$errors}>
        {(errors) => (errors.length ? <ul aria-label="表单错误">{errors.map((message, index) => <li key={index}>{message}</li>)}</ul> : null)}
      </Watch>
    </Form>
  );
}
