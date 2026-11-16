# ShikiForm

ShikiForm 是一个面向 TypeScript 的表单引擎，将表单值、显隐状态、校验规则和联动逻辑统一放在引擎中管理。你可以直接在联动中修改字段的 `$` 状态，React 组件只负责声明界面结构。引擎本身不绑定特定 UI 库，同时提供开箱即用的 Ant Design 适配层。

官网文档：<https://shikiform.pages.dev>

## 安装

```bash
npm i @shikiform/react
```

如需配合 Ant Design 使用，请继续安装 `@shikiform/antd`；需要查询列表、草稿表单等高阶 Hooks 时，安装 `@shikiform/hooks`。

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

`typed(form)` 会返回带表单值类型提示的 `Field` 组件，在编写 `name` 时即可获得自动补全与静态类型检查。

## 文档导航

- [简介](https://shikiform.pages.dev/)
- [快速开始](https://shikiform.pages.dev/guide/quick-start)
- [互动教程](https://shikiform.pages.dev/tutorial/)
- [API 参考](https://shikiform.pages.dev/api)
