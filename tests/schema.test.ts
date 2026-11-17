import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import { z } from 'zod'
import { type StandardSchemaV1 } from '@shikiform/core'
import { createEngine } from '../packages/core/src/engine/create'
import { fieldErrorsOf } from './field-errors'

describe('standard schema', () => {
  it('maps zod issues onto fields, including array and tree paths', async () => {
    const schema = z
      .object({
        email: z.string().email('邮箱格式不对'),
        nick: z.string().min(1, '昵称必填'),
        ghost: z.string().min(1, '幽灵必填'),
        password: z.string(),
        confirm: z.string(),
        items: z.array(z.object({ name: z.string().min(1, '名称必填') })),
        nodes: z.array(
          z.object({
            name: z.string(),
            children: z.array(z.object({ name: z.string().min(1, '节点名必填') })),
          }),
        ),
      })
      .superRefine((value, ctx) => {
        if (value.password !== value.confirm) {
          ctx.addIssue({ code: 'custom', path: ['confirm'], message: '两次密码不一致' })
        }
      })
    const form = createEngine({
      initialValues: {
        email: 'nope',
        nick: '',
        ghost: '',
        password: 'a',
        confirm: 'b',
        items: [{ name: '' }],
        nodes: [{ name: 'root', children: [{ name: '' }] }],
      },
      validate: schema,
    })
    form.registerTree('nodes', { childrenKey: 'children', rowKey: 'id' })
    form.batch((d) => {
      d.nick.$visible = false
      d.ghost.$visible = false; d.ghost.$omit = true
      d.nodes[0]!.children[0]!.$visible = false
    })
    await fieldErrorsOf(form.validate())
    const messages = Object.fromEntries(form.errors.map((error) => [error.path, error.messages.join('|')]))
    expect(messages.email).toContain('邮箱格式不对')
    expect(messages.nick).toBeUndefined()
    expect(messages.ghost).toBeUndefined()
    expect(messages.confirm).toContain('两次密码不一致')
    expect(messages['items.0.name']).toContain('名称必填')
    expect(messages['nodes.0.children.0.name']).toBeUndefined()
    const submitted = form.getSubmitValues()
    expect(submitted).not.toHaveProperty('ghost')
    expect(submitted.nick).toBe('')
  })

  it('mixes a field schema with a built-in rule', async () => {
    const form = createEngine({ initialValues: { email: 'ab', code: 'nope' } })
    form.registerField('email', {
      rules: [z.string().email('邮箱格式不对'), { minLength: 5, message: '太短' }],
    })
    form.registerField('code', {
      rules: [v.pipe(v.string(), v.email('邮箱格式不对')), { minLength: 5, message: '太短' }],
    })
    await fieldErrorsOf(form.validate())
    for (const path of ['email', 'code']) {
      const messages = form.errors.find((error) => error.path === path)?.messages ?? []
      expect(messages.some((message) => message.includes('邮箱'))).toBe(true)
      expect(messages.some((message) => message.includes('太短'))).toBe(true)
    }
  })

  it('joins a field schema path onto that field, including array indexes', async () => {
    const form = createEngine({
      initialValues: {
        address: { city: '', street: '湖滨' },
        items: [{ name: '' }],
      },
    })
    form.registerField('address', {
      rules: z.object({
        city: z.string().min(1, '城市必填'),
        street: z.string(),
      }),
    })
    form.registerField('items', {
      rules: z.array(z.object({ name: z.string().min(1, '名称必填') })),
    })
    await fieldErrorsOf(form.validate())
    const messages = Object.fromEntries(form.errors.map((error) => [error.path, error.messages.join('|')]))
    expect(messages['address.city']).toContain('城市必填')
    expect(messages['items.0.name']).toContain('名称必填')
    expect(messages.address).toBeUndefined()
    expect(messages.items).toBeUndefined()
  })

  it('reads { key } segments from any Standard Schema, including async, and honors display', async () => {
    interface TreeValues {
      nodes: { name: string; children: { name: string }[] }[]
    }
    const schema = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        async validate(value: unknown) {
          await Promise.resolve()
          const tree = value as TreeValues
          if (tree.nodes?.[0]?.children?.[1]?.name) return { value }
          return {
            issues: [
              {
                message: '节点名必填',
                path: ['nodes', { key: 0 }, 'children', { key: 1 }, 'name'],
              },
            ],
          }
        },
      },
    } as StandardSchemaV1<TreeValues>
    const form = createEngine<TreeValues>({
      initialValues: { nodes: [{ name: 'a', children: [{ name: 'ok' }, { name: '' }] }] },
      validate: schema,
    })
    await fieldErrorsOf(form.validate())
    expect(form.errors.find((error) => error.path === 'nodes.0.children.1.name')?.messages.join(' ')).toContain('节点名必填')

    form.batch((d) => {
      d.nodes.$visible = false; d.nodes.$omit = true
    })
    await fieldErrorsOf(form.validate())
    expect(form.errors.find((error) => error.path.startsWith('nodes'))).toBeUndefined()
    expect(form.getSubmitValues()).not.toHaveProperty('nodes')
  })

  it('refreshes one form-schema field without dropping the others', async () => {
    const schema = z
      .object({
        password: z.string(),
        confirm: z.string(),
        nick: z.string().min(1, '昵称必填'),
      })
      .superRefine((value, ctx) => {
        if (value.password !== value.confirm) ctx.addIssue({ code: 'custom', path: ['confirm'], message: '两次密码不一致' })
      })
    const form = createEngine({
      initialValues: { password: 'a', confirm: 'b', nick: '' },
      validate: schema,
    })
    await fieldErrorsOf(form.validate())
    form.setValue('confirm', 'a')
    await fieldErrorsOf(form.validate('confirm'))
    expect(form.errors.find((error) => error.path === 'confirm')).toBeUndefined()
    expect(form.errors.find((error) => error.path === 'nick')?.messages.join(' ')).toContain('昵称必填')
  })

  it('skips a field schema when display is none and still checks hidden', async () => {
    const form = createEngine({ initialValues: { ghost: '', nick: '' } })
    form.registerField('ghost', { rules: z.string().min(1, '幽灵必填') })
    form.registerField('nick', { rules: z.string().min(1, '昵称必填') })
    form.batch((d) => {
      d.ghost.$visible = false; d.ghost.$omit = true
      d.nick.$visible = false
    })
    await fieldErrorsOf(form.validate())
    expect(form.errors.map((error) => error.path)).toEqual([])
  })

  it('maps a valibot cross-field issue onto confirm', async () => {
    const schema = v.pipe(
      v.object({
        password: v.string(),
        confirm: v.string(),
      }),
      v.forward(
        v.partialCheck(
          [['password'], ['confirm']],
          (input) => input.password === input.confirm,
          '两次密码不一致',
        ),
        ['confirm'],
      ),
    )
    const form = createEngine({
      initialValues: { password: 'secret', confirm: 'other' },
      validate: schema,
    })
    await fieldErrorsOf(form.validate())
    expect(form.errors.find((error) => error.path === 'confirm')?.messages.join(' ')).toContain('两次密码不一致')
    form.setValue('confirm', 'secret')
    await fieldErrorsOf(form.validate())
    expect(form.errors.find((error) => error.path === 'confirm')).toBeUndefined()
  })
})
