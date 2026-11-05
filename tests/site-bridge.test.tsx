// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { EnumSource, createForm } from 'shikiform'
import { EnumSource as CoreEnumSource, createForm as createCoreForm } from 'shikiform/core'

// Vue/VitePress island 桥已随旧站点删除；这里保留引擎身份契约
// （发布产物的同一身份由 check-docs-package 的独立打包门禁验证）。
it('source entrypoints share engine identity', () => {
  expect(EnumSource).toBe(CoreEnumSource)
  expect(createForm).toBe(createCoreForm)
})
