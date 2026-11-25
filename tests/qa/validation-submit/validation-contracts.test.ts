import { createForm, defineEffects, enUS, type Rule } from '@shikiform/core'
import { describe, expect, it } from 'vitest'

describe('rule boundaries and message precedence', () => {
  it('accepts inclusive bounds and resolves localized and overridden messages in one pass', async () => {
    const form = createForm({
      initialValues: { qty: 2, code: 'AB', site: 'https://example.test', agree: true },
      fields: {
        qty: { rules: { min: 2, max: 4 } },
        code: { rules: [{ minLength: 2, maxLength: 3 }, { pattern: /^[A-Z]+$/, message: 'Use capital letters' }] },
        site: { rules: { format: 'url' } },
        agree: { rules: { isTrue: true } },
      },
      messages: { ...enUS, maxLength: ({ path, length, maxLength }) => `${path} has ${length} characters of at most ${maxLength}` },
    })

    await expect(form.submit()).resolves.toEqual({ qty: 2, code: 'AB', site: 'https://example.test', agree: true })
    form.setValue('qty', 4)
    form.setValue('code', 'ABC')
    await expect(form.validate()).resolves.toMatchObject({ qty: 4, code: 'ABC' })

    form.setValue('qty', 5)
    form.setValue('code', 'abcd')
    form.setValue('site', 'invalid url')
    form.setValue('agree', false)
    await expect(form.validate()).rejects.toEqual([
      { path: 'qty', messages: ['Must be at most 4'] },
      { path: 'code', messages: ['code has 4 characters of at most 3', 'Use capital letters'] },
      { path: 'site', messages: ['Invalid URL'] },
      { path: 'agree', messages: ['Must be checked'] },
    ])
  })

  it.each(['', null, undefined])('only required rejects an empty value (%s)', async (value) => {
    const rules: Rule[] = [{ min: 2, max: 4 }, { minLength: 2, maxLength: 3, pattern: /^X+$/ }, { format: 'email' }]
    const form = createForm<{ optional: typeof value; required: typeof value }>({
      initialValues: { optional: value, required: value },
      fields: { optional: { rules }, required: { rules: [...rules, { required: true, message: 'Enter a value' }] } },
    })
    await expect(form.validate('optional')).resolves.toBe(value)
    await expect(form.submit()).rejects.toEqual([{ path: 'required', messages: ['Enter a value'] }])
    expect(form.submitting).toBe(false)
    expect(form.validating).toBe(false)
    expect(form.canSubmit).toBe(false)
  })

  it.fails.each([/^VALID$/g, /^VALID$/y])('BUG QA-24: reuses a stateful pattern %s across repeated validation', async (pattern) => {
    const form = createForm({
      initialValues: { code: 'VALID' },
      fields: { code: { rules: { pattern, message: 'Invalid code' } } },
    })

    await expect(form.validate()).resolves.toEqual({ code: 'VALID' })
    await expect(form.submit()).resolves.toEqual({ code: 'VALID' })
  })
})

describe('inheritance and submit gates', () => {
  it('combines inherited gates with the independent omit flag for all 16 states', async () => {
    for (const visible of [true, false]) {
      for (const disabled of [true, false]) {
        for (const readOnly of [true, false]) {
          for (const omit of [true, false]) {
            const form = createForm({
              initialValues: { group: { name: '' } },
              fields: {
                group: { visible, disabled, readOnly, omit },
                'group.name': { required: true, omit: false },
              },
              messages: { required: 'Enter a name' },
            })
            const state = JSON.stringify({ visible, disabled, readOnly, omit })
            const payload = omit ? {} : { group: { name: '' } }
            expect(form.getSubmitValues(), state).toEqual(payload)
            if (visible && !disabled && !readOnly) {
              await expect(form.submit(), state).rejects.toEqual([{ path: 'group.name', messages: ['Enter a name'] }])
              expect(form.canSubmit, state).toBe(false)
            } else {
              await expect(form.submit(), state).resolves.toEqual(payload)
              expect(form.canSubmit, state).toBe(true)
            }
          }
        }
      }
    }
  })

  it('lets a child expressly opt out of each inherited validation gate', async () => {
    const form = createForm({
      initialValues: { group: { name: '', sibling: '' } },
      fields: {
        group: { visible: false, disabled: true, readOnly: true },
        'group.name': { required: true, visible: true, disabled: false, readOnly: false },
        'group.sibling': { required: true },
      },
      messages: { required: 'Enter a name' },
    })
    await expect(form.validate()).rejects.toEqual([{ path: 'group.name', messages: ['Enter a name'] }])
    form.setValue('group.name', 'Ada')
    await expect(form.submit()).resolves.toEqual({ group: { name: 'Ada', sibling: '' } })
  })
})

describe('submission payloads and baseline', () => {
  it('omits several rows by original position and keeps visible and hidden tree nodes in order', async () => {
    const form = createForm({
      initialValues: {
        nodes: [
          { id: 'root', note: 'hidden but submitted', children: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
          { id: 'removed', note: 'never submitted', children: [] },
          { id: 'tail', note: 'retained', children: [] },
        ],
        rows: [{ id: '0' }, { id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }],
      },
      trees: { nodes: { childrenKey: 'children', rowKey: 'id' } },
    })
    form.batch((d) => {
      d.nodes[0].note.$visible = false
      d.nodes[0].children[0].$omit = true
      d.nodes[0].children[2].$omit = true
      d.nodes[1].$omit = true
      d.nodes[1].note.$omit = false
      d.rows[1].$omit = true
      d.rows[3].$omit = true
    })

    const expected = {
      nodes: [
        { id: 'root', note: 'hidden but submitted', children: [{ id: 'b' }] },
        { id: 'tail', note: 'retained', children: [] },
      ],
      rows: [{ id: '0' }, { id: '2' }, { id: '4' }],
    }
    expect(form.getSubmitValues()).toEqual(expected)
    const payload = await form.submit()
    expect(payload).toEqual(expected)
    payload.nodes[0]!.children[0]!.id = 'changed'
    expect(form.getValue('nodes.0.children.1.id')).toBe('b')
    expect(form.values.rows).toHaveLength(5)
  })

  it.fails('BUG QA-13: applies root omit to fields with and without a model', async () => {
    const form = createForm({
      initialValues: { modeled: 'private', additional: 'private too' },
      fields: { modeled: { required: true } },
    })
    form.batch((d) => { d.$omit = true })
    await expect(form.submit()).resolves.toEqual({})
  })

  it('preserves Map, Set and Date copies in scoped validate while returning an explicitly selected omitted path', async () => {
    const form = createForm({
      initialValues: {
        section: {
          draft: 'private',
          config: new Map([['project', { tags: new Set(['active']), date: new Date('2026-01-01T00:00:00Z') }]]),
        },
      },
      fields: { 'section.draft': { omit: true } },
    })
    const copy = await form.validate('section')
    expect(copy).toEqual({ config: form.values.section.config })
    const picked = await form.validate(['section.draft', 'section.config'])
    expect(picked.section.draft).toBe('private')

    copy.config.get('project')!.tags.add('changed')
    picked.section.config.get('project')!.date.setUTCFullYear(2030)
    expect([...form.values.section.config.get('project')!.tags]).toEqual(['active'])
    expect(form.values.section.config.get('project')!.date.getUTCFullYear()).toBe(2026)
  })

  it('adopts saved values as the baseline and still restores later edits on reset', () => {
    const form = createForm({
      initialValues: { rows: [{ name: 'initial', secret: 'local' }] },
      fields: { 'rows.*.secret': { omit: true }, 'rows.*.name': { visible: false } },
    })
    form.setValue('rows.0.secret', 'edited locally')
    expect(form.dirty).toBe(false)
    form.setValue('rows.0.name', 'saved')
    expect(form.dirty).toBe(true)

    form.setInitialValues(form.values)
    expect(form.dirty).toBe(false)
    form.setValue('rows.0.name', 'unsaved')
    expect(form.dirty).toBe(true)
    form.reset()
    expect(form.values).toEqual({ rows: [{ name: 'saved', secret: 'edited locally' }] })
    expect(form.dirty).toBe(false)
    expect(form.edited).toBe(false)
  })

  it('reruns per-row validation derivations only for the rows edited in a batch', () => {
    type Values = { rows: { name: string }[] }
    const checked: number[] = []
    const form = createForm<Values>({
      initialValues: { rows: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }] },
      effects: [
        defineEffects<Values>(({ reaction, draft }) => {
          reaction.each(draft.rows, (row, { index }) => {
            row.name.$required = row.name.$value === ''
            checked.push(index)
          })
        }),
      ],
    })
    expect(checked).toEqual([0, 1, 2, 3])
    checked.length = 0

    form.batch((d) => {
      d.rows[0].name.$value = ''
      d.rows[2].name.$value = 'Updated'
    })
    expect(checked.sort()).toEqual([0, 2])
  })
})
