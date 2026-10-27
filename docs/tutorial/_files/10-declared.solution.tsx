import { Field, Form, Submit, defineEffects, useFieldValue, useForm, useFormState } from 'shikiform';
import { FormItem, Input, Switch } from 'shikiform/ui';

const effects = defineEffects<{ more: boolean; nickname: string; code: string }>(({ reaction }) => {
  reaction((d) => {
    d.code.$rules = [{ required: true, message: '邀请码必填' }];
  });
});

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
        <Field name="code" decorator={<FormItem label="邀请码" help="规则在 reaction 里，卸掉输入框也会校验" />}>
          <Input />
        </Field>
      ) : null}
    </>
  );
}

export default function App() {
  const form = useForm({
    initialValues: { more: false, nickname: '', code: '' },
    effects: [effects],
    fields: { code: {} },
  });
  return (
    <Form form={form} onSubmit={() => undefined}>
      <More />
      <Submit>提交</Submit>
      <Errors />
    </Form>
  );
}
