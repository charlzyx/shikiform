import { useState } from 'react';
import { Field, Form, Watch, defineEffects, useForm, type Draft } from '@shikiform/react';
import { FormItem, Input, Submit, Switch } from '@shikiform/antd';

type Values = { contact: boolean; email: string };

export const effects = defineEffects<Values>(({ reaction }) => {
  reaction((d) => {
    void d.contact.$value;
  });
});

export default function App() {
  const [payload, setPayload] = useState('');
  const form = useForm<Values>({ initialValues: { contact: false, email: 'ada@example.com' }, effects: [effects] });
  return (
    <Form form={form} onSubmit={(values) => setPayload(JSON.stringify(values, null, 2))}>
      <Field name="contact" title="需要联系" decorator={[FormItem]} component={[Switch]} />
      <Field name="email" title="邮箱" required decorator={[FormItem]} component={[Input]} />
      <Submit>提交</Submit>
      <Watch select={(d: Draft<Values>) => d.$errors}>
        {(errors) => (errors.length ? <p role="alert">错误：{errors.join('；')}</p> : null)}
      </Watch>
      {payload ? <pre className="shiki-code">{payload}</pre> : null}
    </Form>
  );
}
