# ShikiForm

**简体中文** · [English](./README.en.md)

ShikiForm 是一个面向 TypeScript 的无 UI 表单引擎，集中管理表单值、字段状态、校验规则与联动逻辑。联动中通过 draft 直接读写字段的 `$` 状态，React 组件只负责渲染界面。核心引擎零 UI 库依赖，通过 Headless React Hooks（`@shikiform/react`）与业务 Hooks（`@shikiform/hooks`）自由接入原生 HTML 或任意 UI 组件库。

官网文档：<https://shikiform.pages.dev>

## 字段联动与数据派生，写在一起

[在线试用费用报销单](https://shikiform.pages.dev/#试试费用报销单)：每行只展示并提交相关明细，合计决定审批方式。

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

将 `effects` 传给 `useForm`。在线示例包含增删费用、校验与本地 JSON 预览；下方保留可直接运行的快速示例。

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
