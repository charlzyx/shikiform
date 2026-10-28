import { Form, defineEffects, useForm, useWatch, type Draft } from 'shikiform';
import { TextField, SwitchField, SubmitButton, FormErrors } from './fields';

type Values = { more: boolean; nickname: string; code: string };

export const effects = defineEffects<Values>(({ reaction }) => {
  reaction((d) => {
    d.code.$rules = [{ required: true, message: '邀请码必填' }];
  });
});

function More() {
  const more = useWatch((d: Draft<Values>) => d.more.$value);
  return (
    <>
      <SwitchField name="more" label="填写更多" />
      {more ? (
        <TextField name="nickname" label="昵称" rules={[{ required: true, message: '昵称必填' }]} />
      ) : null}
      {more ? (
        <TextField name="code" label="邀请码" help="规则在 reaction 里，卸掉输入框也会校验" />
      ) : null}
    </>
  );
}

export default function App() {
  const form = useForm<Values>({
    initialValues: { more: false, nickname: '', code: '' },
    effects: [effects],
  });
  return (
    <Form form={form}>
      <More />
      <SubmitButton>提交</SubmitButton>
      <FormErrors />
    </Form>
  );
}
