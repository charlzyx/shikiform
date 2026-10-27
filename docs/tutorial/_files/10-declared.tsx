import { Field, Form, Submit, useFieldValue, useForm, useFormState } from 'shikiform';
import { FormItem, Input, Switch } from 'shikiform/ui';

function Errors() {
  const errors = useFormState((snap) => snap.errors);
  if (!errors.length) return null;
  return (
    <ul>
      {errors.map((error) => (
        <li key={error.path}>
          {error.path}：{error.messages.join('，')}
        </li>
      ))}
    </ul>
  );
}

function More() {
  const more = useFieldValue('more');
  return (
    <>
      <Field name="more" decorator={<FormItem label="填写更多" inline />}>
        <Switch />
      </Field>
      {more ? (
        <Field name="nickname" decorator={<FormItem label="昵称" />} rules={[{ required: true, message: '昵称必填' }]}>
          <Input />
        </Field>
      ) : null}
      {more ? (
        <Field name="code" decorator={<FormItem label="邀请码" />} rules={[{ required: true, message: '邀请码必填' }]}>
          <Input />
        </Field>
      ) : null}
    </>
  );
}

export default function App() {
  const form = useForm({ initialValues: { more: false, nickname: '', code: '' } });
  return (
    <Form form={form} onSubmit={() => undefined}>
      <More />
      <Submit>提交</Submit>
      <Errors />
    </Form>
  );
}
