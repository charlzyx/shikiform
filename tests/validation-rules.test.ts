import { describe, expect, it } from 'vitest'
import { isStandardSchema, schemaIssuePath, type StandardSchemaV1 } from '../packages/core/src/validation/schema'
import {
  normalizeRules,
  runRules,
  fieldSchemaIssues,
  type Rule,
  type ValidateCtx,
} from '../packages/core/src/validation/rules'
import { collectSchemaIssues, groupSchemaIssues } from '../packages/core/src/validation/schema'

const CTX: ValidateCtx = {
  path: 'a', value: undefined, record: {}, root: {}, parent: {}, array: undefined, index: -1,
  get: () => undefined,
}

/** 最小 Standard Schema v1 实现。 */
function schema(validate: (value: unknown) => StandardSchemaV1.Result<unknown> | Promise<StandardSchemaV1.Result<unknown>>): StandardSchemaV1 {
  return { '~standard': { version: 1, vendor: 'test', validate } }
}

describe('isStandardSchema', () => {
  it('is true for a Standard Schema v1 object only', () => {
    expect(isStandardSchema(schema(() => ({ value: 1 })))).toBe(true)
    expect(isStandardSchema({ '~standard': { version: 1, validate: () => ({ value: 1 }) } })).toBe(true)
    expect(isStandardSchema({ '~standard': { version: 2 } })).toBe(false)
    expect(isStandardSchema({ '~standard': { version: 1, validate: 'nope' } })).toBe(false)
    expect(isStandardSchema(null)).toBe(false)
    expect(isStandardSchema(42)).toBe(false)
    expect(isStandardSchema(() => {})).toBe(false)
  })
})

describe('schemaIssuePath', () => {
  it('joins keys and { key } segments with dots', () => {
    expect(schemaIssuePath(undefined)).toBe('')
    expect(schemaIssuePath([])).toBe('')
    expect(schemaIssuePath(['a', 0, { key: 'b' }])).toBe('a.0.b')
    expect(schemaIssuePath([{ key: 1 }])).toBe('1')
  })
})

describe('normalizeRules', () => {
  it('wraps a bare schema in { schema }; passes rules through; accepts undefined and arrays', () => {
    const z = schema(() => ({ value: 1 }))
    expect(normalizeRules(undefined)).toEqual([])
    expect(normalizeRules({ required: true })).toEqual([{ required: true }])
    expect(normalizeRules(z)).toEqual([{ schema: z }])
    expect(normalizeRules([{ required: true }, z])).toEqual([{ required: true }, { schema: z }])
  })
})

describe('runRules', () => {
  it('required: empty values fail, and rule.message wins over form messages', () => {
    const run = (value: unknown, rules: Rule[], required = false) => runRules(value, rules, { ...CTX, value }, required).messages
    expect(run('', [{ required: true }], false)).toEqual(['必填'])
    expect(run(undefined, [], true)).toEqual(['必填'])
    expect(run(null, [{ required: true, message: '自定义' }], false)).toEqual(['自定义'])
    expect(run('x', [{ required: true }], true)).toEqual([])
  })

  it('constraints pass empty values (only required judges emptiness)', () => {
    const run = (value: unknown, rules: Rule[]) => runRules(value, rules, { ...CTX, value }, false).messages
    expect(run('', [{ minLength: 3 }, { pattern: /\d/ }, { format: 'email' }])).toEqual([])
    expect(run(null, [{ min: 3 }])).toEqual([])
  })

  it('string constraints: minLength / maxLength / pattern', () => {
    const run = (value: string, rules: Rule[]) => runRules(value, rules, { ...CTX, value }, false).messages
    expect(run('ab', [{ minLength: 3 }])).toEqual(['至少 3 个字符'])
    expect(run('abcd', [{ maxLength: 3 }])).toEqual(['最多 3 个字符'])
    expect(run('abc', [{ pattern: /^\d+$/ }])).toEqual(['格式不对'])
    expect(run('12', [{ minLength: 1, maxLength: 5, pattern: /^\d+$/ }])).toEqual([])
  })

  it('number constraints: min / max', () => {
    const run = (value: number, rules: Rule[]) => runRules(value, rules, { ...CTX, value }, false).messages
    expect(run(1, [{ min: 3 }])).toEqual(['不能小于 3'])
    expect(run(5, [{ max: 3 }])).toEqual(['不能大于 3'])
    expect(run(3, [{ min: 3, max: 3 }])).toEqual([])
  })

  it('format: email / url', () => {
    const run = (value: string, rules: Rule[]) => runRules(value, rules, { ...CTX, value }, false).messages
    expect(run('nope', [{ format: 'email' }])).toEqual(['邮箱格式不对'])
    expect(run('a@b.co', [{ format: 'email' }])).toEqual([])
    expect(run('not a url', [{ format: 'url' }])).toEqual(['URL 格式不对'])
    expect(run('https://x.dev', [{ format: 'url' }])).toEqual([])
  })

  it('isTrue requires exactly true', () => {
    const out = runRules(false, [{ isTrue: true }], { ...CTX, value: false }, false).messages
    expect(out).toEqual(['必须勾选'])
    expect(runRules(true, [{ isTrue: true }], { ...CTX, value: true }, false).messages).toEqual([])
  })

  it('a validator: sync message, nothing, a promise (pending), and a throw becomes the message', () => {
    const value = 'v'
    const { messages, pending } = runRules(
      value,
      [
        { validator: () => '太贵' },
        { validator: () => undefined },
        { validator: () => Promise.resolve('迟到') },
        {
          validator: () => {
            throw new Error('炸了')
          },
        },
        { validator: () => null },
      ],
      { ...CTX, value },
      false,
    )
    expect(messages).toEqual(['太贵', '炸了'])
    expect(pending).toHaveLength(1)
  })

  it('a throw without a message falls back to the built-in fallback text', () => {
    const { messages } = runRules('v', [{ validator: () => { throw 'boom' } }], { ...CTX, value: 'v' }, false)
    expect(messages).toEqual(['校验失败'])
  })

  it('a rejected validator promise rejects (the caller drops stale ones; #2, #7)', async () => {
    const { pending } = runRules('v', [{ validator: () => Promise.reject(new Error('迟到的错')) }], { ...CTX, value: 'v' }, false)
    await expect(pending[0]).rejects.toThrow('迟到的错')
  })

  it('non-string / non-number values skip their constraints (an object with minLength passes)', () => {
    expect(runRules({ a: 1 }, [{ minLength: 5 }], { ...CTX, value: { a: 1 } }, false).messages).toEqual([])
  })
})

describe('fieldSchemaIssues', () => {
  it('joins issue paths onto the field path; a missing path is the field itself', () => {
    expect(fieldSchemaIssues('address', [{ path: 'city', message: 'x' }])).toEqual([{ path: 'address.city', message: 'x' }])
    expect(fieldSchemaIssues('address', [{ path: '', message: 'y' }])).toEqual([{ path: 'address', message: 'y' }])
    expect(fieldSchemaIssues('', [{ path: 'a', message: 'z' }])).toEqual([{ path: 'a', message: 'z' }])
  })
})

describe('collectSchemaIssues', () => {
  it('maps issues with their joined paths; no issues gives an empty list', async () => {
    const z = schema((value) => ({ issues: [{ message: 'bad', path: ['child'] }], value }))
    expect(await collectSchemaIssues(z, {})).toEqual([{ path: 'child', message: 'bad' }])
    expect(await collectSchemaIssues(schema(() => ({ value: 1 })), 1)).toEqual([])
  })

  it('an issue without a path is the value itself; a missing message gets the fallback', async () => {
    const z = schema((value) => ({ issues: [{ message: '', path: undefined }], value }))
    expect(await collectSchemaIssues(z, 1)).toEqual([{ path: '', message: expect.any(String) }])
    expect(await collectSchemaIssues(z, 1, '兜底文案')).toEqual([{ path: '', message: '兜底文案' }])
  })

  it('async schemas work; a thrown validator becomes one issue on the value itself', async () => {
    const asyncZod = schema(async (value: unknown) => ({ value }))
    expect(await collectSchemaIssues(asyncZod, 1)).toEqual([])
    const thrown = schema(() => {
      throw new Error('崩了')
    })
    expect(await collectSchemaIssues(thrown, 1)).toEqual([{ path: '', message: '崩了' }])
  })

  it('a malformed schema whose validate is not a function still resolves via the catch path', async () => {
    const broken = { '~standard': { version: 1, vendor: 'x', validate: undefined } } as unknown as StandardSchemaV1
    const out = await collectSchemaIssues(broken, 1)
    expect(out).toHaveLength(1)
    expect(out[0]!.path).toBe('')
  })
})

describe('groupSchemaIssues', () => {
  it('groups by path, keeps later messages, drops duplicates and empty messages', () => {
    const map = groupSchemaIssues([
      { path: 'a', message: 'one' },
      { path: 'a', message: 'one' },
      { path: 'a', message: 'two' },
      { path: 'b', message: 'x' },
      { path: 'b', message: '' },
    ])
    expect(map.get('a')).toEqual(['one', 'two'])
    expect(map.get('b')).toEqual(['x'])
  })

  it('an empty list gives an empty map', () => {
    expect(groupSchemaIssues([]).size).toBe(0)
  })
})
