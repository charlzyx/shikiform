# ShikiForm

ShikiForm 是一个 TypeScript 表单库。值、显隐、校验和联动放在同一个引擎里：联动写成对 draft 上 `$` 状态的赋值，组件只负责渲染。不绑某一种 UI；Ant Design 是可选适配层。

文档：<https://shikiform.pages.dev>

## 安装

```bash
npm i @shikiform/react
```

用 Ant Design 再安装 `@shikiform/antd`。查询列表、影子表单这类 hook 再安装 `@shikiform/hooks`。`@shikiform/react` 会带上引擎 `@shikiform/core`。

这四个包还没有发布到 npm。仓库里的 `npm run release` 只做 `npm publish --dry-run`。

## 一个例子

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

`typed(form)` 返回同一组 `Field`，`name` 按表单值做类型检查。

## 文档

- [简介](https://shikiform.pages.dev/)
- [快速上手](https://shikiform.pages.dev/guide/quick-start)
- [教程](https://shikiform.pages.dev/tutorial/)
- [API](https://shikiform.pages.dev/api)
