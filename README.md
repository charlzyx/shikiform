# ShikiForm

一个表单一个引擎。联动写成 `reaction` / `watch`，读写 draft 上的 `$` 状态（`d.email.$value`）。React 只渲染，Ant Design 只做适配。

文档站：https://shikiform.pages.dev 。应用开发从 [快速开始](https://shikiform.pages.dev/guide/quick-start) 进入。

目前没有发到 npm（`package.json` 是 `private`）。在本仓库执行 `npm ci && npm run build:lib`，再用 workspace 或 `file:` 依赖接进项目。四个入口：`shikiform`、`shikiform/core`、`shikiform/pro`、`shikiform/antd`。

```tsx
import { Form } from 'shikiform'
import { useAntdForm } from 'shikiform/antd'

const form = useAntdForm({ initialValues: { email: '' } })

<Form form={form} onSubmit={save}>
  <form.AppField name="email" title="邮箱" required>
    {(field) => <field.Input />}
  </form.AppField>
</Form>
```

`name` 按 `initialValues` 做类型检查。自定义控件才用 `<Field decorator component>`，见指南里的 [Field、装饰器与组件](https://shikiform.pages.dev/guide/field)。

维护、部署和文档架构见 [CONTRIBUTING.md](CONTRIBUTING.md)。
