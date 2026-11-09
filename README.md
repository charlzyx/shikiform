# ShikiForm

表单一复杂，字段何时必填、何时隐藏、隐藏后还交不交，容易散落在组件的 `if` 里。ShikiForm 把值、字段状态、校验和联动放进一个引擎：联动写成对 draft 上 `$` 状态的赋值，组件只负责渲染。显隐只有 `display`：`visible`（渲染、校验、提交）、`hidden`（不渲染，仍校验仍提交）、`virtual`（渲染并校验，但不提交、不计入 dirty）、`none`（不渲染、不校验、不提交，值留在 store）。和 Formily 的差别是 `hidden` 仍校验、多了 `virtual`、`none` 不删 store 里的值。

文档站：<https://shikiform.pages.dev>（[快速开始](https://shikiform.pages.dev/guide/quick-start) · [核心概念](https://shikiform.pages.dev/guide/concepts) · [示例库](https://shikiform.pages.dev/examples) · [分步教程](https://shikiform.pages.dev/tutorial/)）

## 安装

还没有发布到 npm。在本仓库打出 tarball，再在你的项目里用 `file:` 装上。入口解析的是 `lib/`，所以要先 `build:lib` 再 `npm pack`。拉到新提交后重新打包，`file:` 不会跟着源码变。

```bash
# 在 shikiform 仓库。当前 version 是 0.1.0，产物是 shikiform-0.1.0.tgz
npm ci
npm run build:lib
npm pack
```

```bash
# 在你的项目
npm install ../shikiform/shikiform-0.1.0.tgz
```

`package.json` 里会写成：

```json
{
  "dependencies": {
    "shikiform": "file:../shikiform/shikiform-0.1.0.tgz"
  }
}
```

路径按两边目录的相对位置改。

同一仓库用 workspace 时，把 shikiform 列进 workspace，并且同样先跑过 `npm run build:lib`。

pnpm（`pnpm-workspace.yaml` 的 `packages` 包含这个目录）：

```json
{
  "dependencies": {
    "shikiform": "workspace:*"
  }
}
```

Yarn Berry（v2 及以上，根 `package.json` 的 `workspaces` 包含这个目录）同样写 `"shikiform": "workspace:*"`。Yarn Classic（v1）不认识 `workspace:`，写 `"shikiform": "*"`，由 workspaces 按包名链到仓库里的那一份。

| peer 依赖 | 版本 | 什么时候需要 |
|---|---|---|
| `react` / `react-dom` | `^18 \|\| ^19` | 用 React 层时 |
| `antd` / `dayjs` | `^5.18` / `^1` | 只在用 `shikiform/antd` 时（`FormLayout layout="vertical"` 需要 antd 5.18 起的 `Form.Item layout`） |

四个入口：`shikiform/core`（无 React 的引擎）、`shikiform`（React 组件与 Hooks）、`shikiform/pro`（无 UI 的表格 / 查询 / 草稿）、`shikiform/antd`（`FormItem`、控件与按钮）。

## 第一张表单

字段只有一种写法：`<Field>` 拥有路径，`decorator={[FormItem]}` 显示标签、星号和错误，`component={[Input]}` 是 connect 过的 antd 控件。`typed(form)` 返回同一组组件，`name` 按表单值类型检查。`<Form>` 自己就是 `<form>`，提交回调写在它上面。

```tsx
import { useState } from 'react';
import { Form, typed, useForm } from 'shikiform';
import { FormButtonGroup, FormItem, FormLayout, Input, InputNumber, Reset, Submit } from 'shikiform/antd';

type Values = { name: string; email: string; age: number | null };

export default function App() {
  const [result, setResult] = useState('还没有提交');
  const form = useForm<Values>({ initialValues: { name: '', email: '', age: 18 } });
  const F = typed(form);
  return (
    <Form form={form} onSubmit={(values) => setResult(JSON.stringify(values))}>
      <FormLayout labelCol={{ span: 4 }} wrapperCol={{ span: 20 }}>
        <F.Field name="name" title="姓名" required decorator={[FormItem]} component={[Input, { placeholder: 'Ada' }]} />
        <F.Field name="email" title="邮箱" required rules={{ format: 'email', message: '邮箱格式不对' }}
          decorator={[FormItem]} component={[Input]} />
        <F.Field name="age" title="年龄" rules={{ min: 0, max: 150 }} decorator={[FormItem]} component={[InputNumber]} />
        <FormButtonGroup.FormItem>
          <Submit>提交</Submit>
          <Reset />
        </FormButtonGroup.FormItem>
      </FormLayout>
      <pre aria-live="polite">{result}</pre>
    </Form>
  );
}
```

这段和文档站[快速开始](https://shikiform.pages.dev/guide/quick-start)的第一例相同。不用 antd 时见 [Headless · 接自己的组件库](https://shikiform.pages.dev/guide/headless#接自己的组件库)。

## 参与开发

贡献、本地开发、文档站和 Cloudflare Pages 部署见 [CONTRIBUTING.md](CONTRIBUTING.md)。
