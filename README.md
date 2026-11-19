# ShikiForm

ShikiForm 是一个面向 TypeScript 的无 UI 表单引擎，集中管理表单值、字段状态、校验规则与联动逻辑。联动中通过 draft 直接读写字段的 `$` 状态，React 组件只负责渲染界面。核心引擎不依赖特定组件库，另提供 Ant Design 适配包与业务 Hooks。

官网文档：<https://shikiform.pages.dev>

## 安装

```bash
npm i @shikiform/react
```

配合 Ant Design 使用时安装 `@shikiform/antd`；使用查询列表、草稿表单等业务 Hooks 时安装 `@shikiform/hooks`。

## 快速示例

```tsx
import { useState } from 'react';
import { Form, typed, useForm } from '@shikiform/react';
import { FormButtonGroup, FormItem, FormLayout, Input, Submit } from '@shikiform/antd';

type Values = { name: string; email: string };

export default function App() {
  const [result, setResult] = useState('还没有提交');
  const form = useForm<Values>({ initialValues: { name: '', email: '' } });
  const F = typed(form);
  return (
    <Form form={form} onSubmit={(values) => setResult(JSON.stringify(values))}>
      <FormLayout labelCol={{ span: 4 }} wrapperCol={{ span: 20 }}>
        <F.Field name="name" title="姓名" required decorator={[FormItem]} component={[Input]} />
        <F.Field name="email" title="邮箱" required rules={{ format: 'email' }} decorator={[FormItem]} component={[Input]} />
        <FormButtonGroup.FormItem>
          <Submit>提交</Submit>
        </FormButtonGroup.FormItem>
      </FormLayout>
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
