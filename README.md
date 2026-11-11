# ShikiForm

ShikiForm 是一个 TypeScript 表单库。值、显隐、校验和联动放在同一个引擎里：联动写成对 draft 上 `$` 状态的赋值，组件只负责渲染。不绑某一种 UI；Ant Design 是可选适配层。

文档：<https://shikiform.pages.dev>

## 安装

这四个包还没有发布到 npm。仓库里的 `npm run release` 只做 `npm publish --dry-run`。

发布到 npm 之后：

```bash
npm i @shikiform/react
pnpm add @shikiform/react
yarn add @shikiform/react
```

用 Ant Design 再安装 `@shikiform/antd`，和 `@shikiform/react` 一起装。`Form`、`useForm`、`typed` 从 `@shikiform/react` 引入，`@shikiform/antd` 不重新导出它们；pnpm 只允许 import 直接依赖。查询列表、影子表单再安装 `@shikiform/hooks`。`@shikiform/react` 依赖引擎 `@shikiform/core`，从注册表安装时会一并装上。只要引擎、不要 React 时单独装 `@shikiform/core`。peer 是 `react` / `react-dom`（`^18 || ^19`）；`@shikiform/antd` 还要 `antd@^5.18` 和 `dayjs@^1`。

### 本地 tarball

包还不在 npm 上时，在本仓库根目录先构建再打包。每个包的 `files` 只有 `dist/`，不构建就没有可运行的文件。`@shikiform/react` 依赖 `@shikiform/core@0.1.0`（版本以该包 `package.json` 为准）。这个版本不在注册表里，只打包或只安装 react 会 404。core 和 react 都要打包，并在同一次安装里装上。

```bash
npm ci
npm run build:lib
npm pack -w @shikiform/core --pack-destination packages/core
npm pack -w @shikiform/react --pack-destination packages/react
```

tarball 在包目录下。文件名是包名去掉 `@`、把 `/` 换成 `-`，再加上版本：`packages/core/shikiform-core-0.1.0.tgz`、`packages/react/shikiform-react-0.1.0.tgz`。

下面假定项目和本仓库是同级目录。路径按实际位置改。

npm 可以在命令行一次装上两个 tarball：

```bash
npm i ../shikiform/packages/core/shikiform-core-0.1.0.tgz ../shikiform/packages/react/shikiform-react-0.1.0.tgz
```

写进 `package.json` 再安装，是同一件事。pnpm 和 Yarn 不能靠「同一次装上两个 tarball」对上依赖：它们仍按 `@shikiform/core@0.1.0` 去注册表查找。pnpm 用 `pnpm.overrides` 指回 core 的 tarball，Yarn 1 用 `resolutions`。Yarn 1 不自动安装 peer，把 `react` 和 `react-dom` 写进 `dependencies`。

```json
{
  "dependencies": {
    "@shikiform/core": "file:../shikiform/packages/core/shikiform-core-0.1.0.tgz",
    "@shikiform/react": "file:../shikiform/packages/react/shikiform-react-0.1.0.tgz",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "pnpm": {
    "overrides": {
      "@shikiform/core": "file:../shikiform/packages/core/shikiform-core-0.1.0.tgz"
    }
  },
  "resolutions": {
    "@shikiform/core": "file:../shikiform/packages/core/shikiform-core-0.1.0.tgz"
  }
}
```

然后 `npm i`、`pnpm install` 或 `yarn install`。`npm` 会忽略 `pnpm` 和 `resolutions`。

要用 `@shikiform/antd`，四个包都打包（antd 依赖 core、react、hooks）。在仓库根目录：

```bash
npm pack -w @shikiform/core --pack-destination packages/core
npm pack -w @shikiform/react --pack-destination packages/react
npm pack -w @shikiform/hooks --pack-destination packages/hooks
npm pack -w @shikiform/antd --pack-destination packages/antd
```

在项目里一次装上：

```bash
npm i ../shikiform/packages/core/shikiform-core-0.1.0.tgz ../shikiform/packages/react/shikiform-react-0.1.0.tgz ../shikiform/packages/hooks/shikiform-hooks-0.1.0.tgz ../shikiform/packages/antd/shikiform-antd-0.1.0.tgz
```

`dependencies` 里为每个 tarball 写一条 `file:`，并加上 peer `antd`（`^5.18.0`）和 `dayjs`（`^1`）。`pnpm.overrides` 与 `resolutions` 里为 `@shikiform/core`、`@shikiform/react`、`@shikiform/hooks` 各写一条，指向同一个 tarball。Yarn 1 安装这组依赖时，antd 的间接依赖 `scroll-into-view-if-needed@3.2.0` 要求 Node `>=26`。Node 更低时改跑 `yarn install --ignore-engines`。只要 `@shikiform/hooks`、不要 antd 时，打包并安装 core、react、hooks 三个 tarball 即可。

### workspace

先在本仓库执行上面的 `npm ci` 和 `npm run build:lib`。把仓库放进 workspace（目录名按克隆来）。

pnpm：根目录 `.npmrc` 写 `link-workspace-packages=true`，`pnpm-workspace.yaml`：

```yaml
packages:
  - 'app'
  - 'shikiform/packages/*'
```

应用的依赖写 `"@shikiform/react": "workspace:*"`。`.npmrc` 里的 `link-workspace-packages=true` 让 pnpm 把 `@shikiform/core@0.1.0` 接到 workspace 里的 core。用 antd 时再加 `"@shikiform/antd": "workspace:*"`。

Yarn 4（Berry）用同一套目录。根 `package.json` 的 `workspaces` 包含 `app` 和 `shikiform/packages/*`，应用里同样是 `"@shikiform/react": "workspace:*"`。`.yarnrc.yml`：

```yaml
nodeLinker: node-modules
```

Yarn 4 默认的 PnP 下，Node 直接 import 找不到这些包。Yarn 1 没有 `workspace:*`，用上面的 tarball 和 `resolutions`。

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
