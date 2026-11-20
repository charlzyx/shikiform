# ShikiForm

**简体中文** · [English](./README.en.md)

ShikiForm 是一个面向 TypeScript 的无 UI 表单引擎，集中管理表单值、字段状态、校验规则与联动逻辑。联动中通过 draft 直接读写字段的 `$` 状态，React 组件只负责渲染界面。核心引擎零 UI 库依赖，通过 Headless React Hooks（`@shikiform/react`）与业务 Hooks（`@shikiform/hooks`）自由接入原生 HTML 或任意 UI 组件库。

官网文档：<https://shikiform.pages.dev>

## 一个联动，同时控制显隐、必填与提交

切到企业发票，税号显示并必填，填写后随表单提交；切回个人发票，税号隐藏、跳过校验，并从提交 JSON 中移除。规则集中在一个 `reaction` 中，输入控件只负责读写值。

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

个人发票的提交结果：

```json
{ "invoice": "personal" }
```

企业发票填写税号 `123456789` 后的提交结果：

```json
{ "invoice": "company", "taxId": "123456789" }
```

`$visible` 控制渲染和校验，`$required` 控制必填，`$omit` 控制是否进入提交结果。隐藏字段的值仍保留在表单状态中；上面的 `$omit = !company` 将其排除在个人发票的提交数据之外。

在 React 中，将同一份 `effects` 传给 `useForm({ initialValues, effects: [effects] })`。查看官网的[企业开票联动](https://shikiform.pages.dev/)与[可交互的条件显隐示例](https://shikiform.pages.dev/examples/linkage#条件显隐)，或从下方完整 React 示例开始。

## 安装

```bash
npm i @shikiform/react
```

使用查询列表、草稿表单、数组表格等无 UI 业务 Hooks 时按需安装 `@shikiform/hooks`。

## 快速示例

```tsx
import { useState, type ReactNode } from 'react';
import { Form, Submit, typed, useField, useFieldDecorator, useForm } from '@shikiform/react';

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
  const [result, setResult] = useState('还没有提交');
  const form = useForm<Values>({ initialValues: { name: '', email: '' } });
  const F = typed(form);
  return (
    <Form form={form} onSubmit={(values) => setResult(JSON.stringify(values))}>
      <F.Field name="name" title="姓名" required decorator={[FieldItem]} component={[TextInput]} />
      <F.Field name="email" title="邮箱" required rules={{ format: 'email' }} decorator={[FieldItem]} component={[TextInput]} />
      <Submit>提交</Submit>
      <pre>{result}</pre>
    </Form>
  );
}
```

`typed(form)` 返回绑定了表单值类型的 `Field` 组件，在编译期检查字段路径 `name`。

## 文档导航

- [简介](https://shikiform.pages.dev/)
- [快速开始](https://shikiform.pages.dev/guide/quick-start)
- [互动教程](https://shikiform.pages.dev/tutorial/)
- [API 参考](https://shikiform.pages.dev/api)
