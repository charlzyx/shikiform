import { Field, Form, Watch, defineEffects, useForm, type Draft } from '@shikiform/react';
import { FormItem, Input, Submit, Switch } from '@shikiform/antd';

type Values = { more: boolean; nickname: string; code: string };

export const effects = defineEffects<Values>(({ reaction }) => {
  reaction((d) => {
    d.code.$rules = [{ required: true, message: '邀请码必填' }];
  });
});

function More() {
  return (
    <Watch select={(d: Draft<Values>) => d.more.$value}>
      {(more) => more ? (
        <>
          <Field name="nickname" title="昵称" rules={{ required: true, message: '昵称必填' }} decorator={[FormItem]} component={[Input]} />
          <Field name="code" title="邀请码" description="规则在 reaction 里，卸掉输入框也会校验" decorator={[FormItem]} component={[Input]} />
        </>
      ) : null}
    </Watch>
  );
}

export default function App() {
  const form = useForm<Values>({
    initialValues: { more: false, nickname: '', code: '' },
    effects: [effects],
  });
  return (
    <Form form={form}>
      <Field name="more" title="填写更多" decorator={[FormItem]} component={[Switch]} />
      <More />
      <Submit>提交</Submit>
      <Watch select={(d: Draft<Values>) => d.$errors}>
        {(errors) => (errors.length ? <ul aria-label="表单错误">{errors.map((message, index) => <li key={index}>{message}</li>)}</ul> : null)}
      </Watch>
    </Form>
  );
}
