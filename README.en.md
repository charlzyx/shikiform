# ShikiForm

[简体中文](./README.md) · **English**

ShikiForm manages form values, field state, validation and dependencies in a TypeScript engine. Write field logic against a draft, then connect the engine to native HTML or your React component library with headless hooks.

[English documentation](https://shikiform.pages.dev/en/)

## Field rules and derived data, together

[Try the expense claim](https://shikiform.pages.dev/en/#try-an-expense-claim): each row shows only the relevant details; the total selects the approval route.

```ts
import { defineEffects } from '@shikiform/react';

type Expense = { category: 'travel' | 'meal'; amount: number | null; city: string; attendees: string };
type Values = { expenses: Expense[]; summary: { total: number; approval: 'standard' | 'manager' } };

const effects = defineEffects<Values>(({ reaction, draft }) => {
  reaction.each(draft.expenses, (row) => {
    const { category, city, attendees } = row;
    const travel = category.$value === 'travel';
    city.$visible = travel;
    city.$required = travel;
    city.$omit = !travel;
    attendees.$visible = !travel;
    attendees.$required = !travel;
    attendees.$omit = travel;
  });
  reaction(({ expenses, summary }) => {
    const total = expenses.$value.reduce((sum, item) => sum + (item.amount ?? 0), 0);
    summary.$value.total = Math.round(total * 100) / 100;
    summary.$value.approval = total > 1000 ? 'manager' : 'standard';
  });
});
```

Pass `effects` to `useForm`. The full interactive example includes adding/removing expenses, validation and a local JSON preview.

## Installation

```bash
npm i @shikiform/react
```

Install `@shikiform/react` as well if you need query tables, shadow forms or editable array tables.

## Quick example

```tsx
import { useState, type ReactNode } from 'react';
import { enUS, Form, Submit, typed, useField, useFieldDecorator, useForm } from '@shikiform/react';

type Values = { name: string; email: string };

function FieldItem({ children }: { children?: ReactNode }) {
  const d = useFieldDecorator();
  return (
    <div>
      <label {...d.labelProps}>
        {d.required ? '* ' : ''}
        {d.label}
      </label>
      {children}
      {d.errorProps && <small {...d.errorProps}>{d.errors[0]}</small>}
    </div>
  );
}

function TextInput() {
  const field = useField<string>();
  return (
    <input
      id={field.id}
      value={field.value ?? ''}
      onChange={(e) => field.onChange(e.target.value)}
      onBlur={field.onBlur}
    />
  );
}

export default function App() {
  const [result, setResult] = useState('No submission yet');
  const form = useForm<Values>({ messages: enUS, initialValues: { name: '', email: '' } });
  const F = typed(form);
  return (
    <Form form={form} onSubmit={(values) => setResult(JSON.stringify(values))}>
      <F.Field name="name" title="Name" required decorator={[FieldItem]} component={[TextInput]} />
      <F.Field name="email" title="Email" required rules={{ format: 'email' }} decorator={[FieldItem]} component={[TextInput]} />
      <Submit>Submit</Submit>
      <pre>{result}</pre>
    </Form>
  );
}
```

`typed(form)` binds the field components to the form's value type, so TypeScript checks the `name` path at compile time.

## Documentation

- [Overview](https://shikiform.pages.dev/en/)
- [Quick start](https://shikiform.pages.dev/en/guide/quick-start)
- [Interactive tutorial](https://shikiform.pages.dev/en/tutorial/)
- [API reference](https://shikiform.pages.dev/en/api)

## License

[MIT](./LICENSE)
