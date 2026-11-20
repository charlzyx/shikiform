# ShikiForm

[简体中文](./README.md) · **English**

ShikiForm manages form values, field state, validation and dependencies in a TypeScript engine. Write field logic against a draft, then connect the engine to native HTML or your React component library with headless hooks.

[English documentation](https://shikiform.pages.dev/en/)

## One reaction for visibility, validation and submission

Choose a company invoice: the tax ID appears, becomes required and is included when the form submits. Switch back to a personal invoice: it is hidden, skips validation and is excluded from the submitted JSON. One `reaction` owns the rule; input controls only read and write values.

```ts
import { createForm, defineEffects } from '@shikiform/react';

type InvoiceValues = { invoice: 'personal' | 'company'; taxId: string };

const effects = defineEffects<InvoiceValues>(({ reaction }) => {
  reaction((d) => {
    const company = d.invoice.$value === 'company';
    d.taxId.$visible = company;
    d.taxId.$required = company;
    d.taxId.$omit = !company;
  });
});

const form = createForm<InvoiceValues>({
  initialValues: { invoice: 'personal', taxId: '' },
  effects: [effects],
});
```

A personal invoice submits:

```json
{ "invoice": "personal" }
```

A company invoice with the tax ID `123456789` submits:

```json
{ "invoice": "company", "taxId": "123456789" }
```

`$visible` controls rendering and validation, `$required` controls required validation, and `$omit` controls inclusion in the submitted payload. A hidden field keeps its value in form state; `$omit = !company` excludes it from the personal invoice payload.

In React, pass the same `effects` to `useForm({ initialValues, effects: [effects] })`. See the [company invoice linkage](https://shikiform.pages.dev/en/) and [interactive conditional visibility example](https://shikiform.pages.dev/en/examples/linkage#conditional-visibility), or start with the complete React example below.

## Installation

```bash
npm i @shikiform/react
```

Install `@shikiform/hooks` as well if you need query tables, shadow forms or editable array tables.

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
