import { Form, Field, Submit, useForm } from 'shikiform';
import { FormItem, Input } from 'shikiform/ui';

export default function Welcome() {
  const form = useForm({ initialValues: { name: 'Ada' } });
  return (
    <Form form={form} onSubmit={() => undefined}>
      <Field name="name" decorator={<FormItem label="姓名" />}>
        <Input />
      </Field>
      <Submit>提交</Submit>
    </Form>
  );
}
