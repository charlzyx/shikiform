// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { FormEngine, createForm } from 'shikiform'
import { FormEngine as CoreEngine, createForm as createCoreForm } from 'shikiform/core'

// Vue/VitePress island 桥已随旧站点删除；这里保留引擎身份契约
// （发布产物的同一身份由 check-docs-package 的独立打包门禁验证）。
it('source entrypoints share engine identity', () => {
  expect(FormEngine).toBe(CoreEngine)
  expect(createForm).toBe(createCoreForm)
})
