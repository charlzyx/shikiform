// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { Button } from 'antd'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { engineOf } from '@shikiform/core/internal'
import {
  ArrayField,
  createForm,
  defineEffects,
  enUS,
  Field,
  Form,
  ObjectField,
  setDefaultMessages,
  useField,
  zhCN,
} from '@shikiform/react'
import { FieldGroup, useFieldGroup } from '@shikiform/react/internal'
import {
  ArrayTable,
  FormItem,
  Input,
  ShadowDrawer,
  ShadowForm,
  ShadowModal,
  ShadowPopconfirm,
  useShadow,
} from '@shikiform/antd'
import * as HooksPublic from '@shikiform/hooks'
import { useShadowForm } from '@shikiform/hooks'

afterEach(() => {
  cleanup()
  setDefaultMessages(zhCN)
})

function Host({ form, children }: { form: ReturnType<typeof createForm<any>>; children: ReactNode }) {
  return <Form form={form}>{children}</Form>
}

describe('FormEngine.forkOptions', () => {
  it('deep-clones concrete initialValues, strips exact + wildcard fields & runtime registerField/registerTree, and skips effects/validate', () => {
    const host = createForm({
      initialValues: {
        info: { domain: 'a.com', nested: { port: 80 } },
        list: [
          { id: 1, domain: 'row0.com', tags: [{ label: 't0' }] },
          { id: 2, domain: 'row1.com', tags: [{ label: 't1' }] },
        ],
      },
      fields: {
        'info.domain': { required: true, title: '域名' },
        'list.*': { readOnly: true },
        'list.*.domain': { required: true, title: '默认域名' },
        'list.0.domain': { title: '首行域名' },
        'list.*.tags.*.label': { required: true },
        other: { required: true },
      },
      trees: {
        'list.*.deps': { childrenKey: 'subs', rowKey: 'code' },
      } as any,
      messages: enUS,
      validateTrigger: ['onChange'],
      asyncDebounceMs: 250,
      enumPolicy: 'clear',
      validate: () => ({ other: 'bad' }),
      effects: [
        defineEffects<any>(({ reaction }) => {
          reaction((d) => {
            void d.info.domain.$value
          })
        }),
      ],
    })
    const engine = engineOf(host)
    engine.registerField('list.0.extra', { title: '运行时字段', required: true })
    engine.registerField('list.*.note', { title: '模板备注' })
    engine.registerTree('info.orgTree', { childrenKey: 'items', rowKey: 'uid' })

    const infoFork = engine.forkOptions('info')
    expect(infoFork.initialValues).toEqual({ domain: 'a.com', nested: { port: 80 } })
    ;(infoFork.initialValues.nested as { port: number }).port = 8080
    expect(host.getValue('info').nested.port).toBe(80)
    expect(infoFork.fields).toEqual({ domain: { required: true, title: '域名' } })
    expect(infoFork.trees).toEqual({ orgTree: { childrenKey: 'items', rowKey: 'uid' } })
    expect(infoFork.messages).toEqual(enUS)
    expect(infoFork.validateTrigger).toEqual(['onChange'])
    expect(infoFork.asyncDebounceMs).toBe(250)
    expect(infoFork.enumPolicy).toBe('clear')
    expect(infoFork.effects).toBeUndefined()
    expect(infoFork.validate).toBeUndefined()

    const row0Fork = engine.forkOptions('list[0]')
    expect(row0Fork.initialValues).toEqual({ id: 1, domain: 'row0.com', tags: [{ label: 't0' }] })
    // Exact `list.0.domain` overrides `title` while keeping `required: true` from `list.*.domain`.
    expect(row0Fork.fields).toEqual({
      domain: { required: true, title: '首行域名' },
      'tags.*.label': { required: true },
      extra: { title: '运行时字段', required: true },
      note: { title: '模板备注' },
    })
    expect(row0Fork.trees).toEqual({ deps: { childrenKey: 'subs', rowKey: 'code' } })
    expect(row0Fork.readOnly).toBe(true)

    const row1Fork = engine.forkOptions('list.1')
    expect(row1Fork.fields).toEqual({
      domain: { required: true, title: '默认域名' },
      'tags.*.label': { required: true },
      note: { title: '模板备注' },
    })

    const addFork = engine.forkOptions('list.*')
    expect(addFork.initialValues).toBeUndefined()
    expect(addFork.readOnly).toBe(true)
    expect(addFork.fields).toEqual({
      domain: { required: true, title: '默认域名' },
      'tags.*.label': { required: true },
      note: { title: '模板备注' },
    })
  })

  it('inherits parent effectivePattern in add mode when list.* has no own pattern', () => {
    const host = createForm({
      initialValues: { list: [] as { name: string }[] },
      readOnly: true,
    })
    expect(engineOf(host).forkOptions('list.*').readOnly).toBe(true)
  })
})

describe('useShadowForm', () => {
  it('removes useArrayShadow from public @shikiform/hooks exports', () => {
    expect('useArrayShadow' in HooksPublic).toBe(false)
  })

  it('opens a fresh draft per open, validates on confirm, and never writes an unbound host by itself', async () => {
    const seen: unknown[] = []
    const { result } = renderHook(() =>
      useShadowForm<{ domain: string }, { id: number }>({
        fields: { domain: { required: true } },
        onOk: (values) => void seen.push(values),
      }),
    )
    await act(() => result.current.open({ domain: 'a.com' }, { id: 1 }))
    expect(result.current.visible).toBe(true)
    expect(result.current.context).toEqual({ id: 1 })
    const first = result.current.form
    act(() => result.current.form.setValue('domain', ''))
    let outcome: Awaited<ReturnType<typeof result.current.confirm>> | undefined
    await act(async () => {
      outcome = await result.current.confirm()
    })
    expect(outcome!.ok).toBe(false)
    expect(result.current.visible).toBe(true)
    act(() => result.current.form.setValue('domain', 'b.com'))
    await act(async () => {
      outcome = await result.current.confirm()
    })
    expect(outcome).toEqual({ ok: true, values: { domain: 'b.com' } })
    expect(seen).toEqual([{ domain: 'b.com' }])
    expect(result.current.visible).toBe(false)
    await act(() => result.current.open({ domain: 'c.com' }))
    expect(result.current.form).not.toBe(first)
    expect(result.current.form.getValue('domain')).toBe('c.com')
    expect(result.current.form.dirty).toBe(false)
  })

  it('async loaders: the newest open wins', async () => {
    const { result } = renderHook(() => useShadowForm<{ v: number }>())
    let slow: (value: { v: number }) => void = () => {}
    act(() => void result.current.open(() => new Promise((resolve) => (slow = resolve))))
    expect(result.current.loading).toBe(true)
    await act(() => result.current.open({ v: 2 }))
    await act(async () => slow({ v: 1 }))
    expect(result.current.form.getValue('v')).toBe(2)
    expect(result.current.loading).toBe(false)
  })

  it('bound object edit shallow-merges write-back preserving virtual keys, and cancel leaves host clean', async () => {
    const host = createForm({
      initialValues: { info: { domain: 'a.com', desc: 'ping', secret: 'keep-me' } },
      fields: {
        'info.domain': { required: true },
        'info.secret': { omit: true },
      },
    })
    const { result } = renderHook(() =>
      useShadowForm<{ domain: string; desc: string; secret?: string }>({ form: host, name: 'info' }),
    )

    await act(() => result.current.open())
    act(() => result.current.form.setValue('domain', 'discarded.com'))
    act(() => result.current.cancel())
    expect(host.getValue('info')).toEqual({ domain: 'a.com', desc: 'ping', secret: 'keep-me' })
    expect(host.dirty).toBe(false)
    expect(host.edited).toBe(false)

    await act(() => result.current.open())
    act(() => result.current.form.setValue('domain', ''))
    let bad: Awaited<ReturnType<typeof result.current.confirm>> | undefined
    await act(async () => {
      bad = await result.current.confirm()
    })
    // Inherited `info.domain` required rule blocks submit.
    expect(bad!.ok).toBe(false)
    expect(host.dirty).toBe(false)

    act(() => result.current.form.setValue('domain', 'saved.com'))
    await act(async () => {
      await result.current.confirm()
    })
    expect(host.getValue('info')).toEqual({ domain: 'saved.com', desc: 'ping', secret: 'keep-me' })
    expect(host.dirty).toBe(true)
    expect(host.edited).toBe(true)
  })

  it('tracks moved rows by key on write-back, and warns + skips when the row was deleted before confirm', async () => {
    const host = createForm({
      initialValues: {
        list: [
          { id: 'r1', domain: 'one.com', token: 'v1' },
          { id: 'r2', domain: 'two.com', token: 'v2' },
        ],
      },
      fields: { 'list.*.token': { omit: true } },
    })
    const { result } = renderHook(() =>
      useShadowForm<{ id: string; domain: string; token?: string }>({
        form: host,
        name: 'list.0',
        rowKey: 'id',
      }),
    )

    // Open on index 0 (`r1`), then move `r1` to index 1 before confirming.
    await act(() => result.current.open())
    act(() => engineOf(host).moveArray('list', 0, 1))
    act(() => result.current.form.setValue('domain', 'one-edited.com'))
    await act(async () => {
      await result.current.confirm()
    })
    expect(host.getValue('list')).toEqual([
      { id: 'r2', domain: 'two.com', token: 'v2' },
      { id: 'r1', domain: 'one-edited.com', token: 'v1' },
    ])

    // Open on index 0 (`r2`), then remove `r2` before confirming.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await act(() => result.current.open())
      act(() => engineOf(host).removeArray('list', 0))
      act(() => result.current.form.setValue('domain', 'gone.com'))
      let res: Awaited<ReturnType<typeof result.current.confirm>> | undefined
      await act(async () => {
        res = await result.current.confirm()
      })
      expect(res!.ok).toBe(true)
      expect(result.current.visible).toBe(false)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(host.getValue('list')).toEqual([{ id: 'r1', domain: 'one-edited.com', token: 'v1' }])
    } finally {
      warn.mockRestore()
    }
  })

  it('supports add mode and skips write-back when options.onOk or per-call onOk returns false', async () => {
    const host = createForm({
      initialValues: { list: [{ id: 1, domain: 'a.com' }] },
      fields: { 'list.*.domain': { required: true } },
    })
    let block = false
    const { result } = renderHook(() =>
      useShadowForm<{ id: number; domain: string }>({
        form: host,
        name: 'list',
        add: { id: 2, domain: '' },
        onOk: () => (block ? false : undefined),
      }),
    )

    // Inherited `list.*.domain` required rule validates in add mode.
    await act(() => result.current.open())
    let invalid: Awaited<ReturnType<typeof result.current.confirm>> | undefined
    await act(async () => {
      invalid = await result.current.confirm()
    })
    expect(invalid!.ok).toBe(false)
    expect(host.getValue('list')).toHaveLength(1)

    // options.onOk returning false closes without pushing.
    block = true
    act(() => result.current.form.setValue('domain', 'skipped.com'))
    await act(async () => {
      const skipped = await result.current.confirm()
      expect(skipped).toEqual({ ok: true, values: { id: 2, domain: 'skipped.com' } })
    })
    expect(result.current.visible).toBe(false)
    expect(host.getValue('list')).toHaveLength(1)

    // Per-call onOk returning false also skips write-back.
    block = false
    await act(() => result.current.open())
    act(() => result.current.form.setValue('domain', 'skipped-call.com'))
    await act(async () => {
      await result.current.confirm(() => false)
    })
    expect(host.getValue('list')).toHaveLength(1)

    // Normal confirm appends to `list`.
    await act(() => result.current.open())
    act(() => result.current.form.setValue('domain', 'added.com'))
    await act(async () => {
      await result.current.confirm()
    })
    expect(host.getValue('list')).toEqual([
      { id: 1, domain: 'a.com' },
      { id: 2, domain: 'added.com' },
    ])
  })
})

describe('Shadow components', () => {
  it('ShadowModal bound by name edits a copy and writes back only on OK', async () => {
    const form = createForm({ initialValues: { info: { domain: 'www.baidu.com', desc: 'ping' } } })
    render(
      <Host form={form}>
        <ShadowModal name="info" title="编辑" trigger={<Button data-testid="open">编辑</Button>}>
          <Field name="domain" title="域名" decorator={[FormItem]}>
            <Input data-testid="shadow-domain" />
          </Field>
        </ShadowModal>
      </Host>,
    )
    fireEvent.click(screen.getByTestId('open'))
    await waitFor(() => expect((screen.getByTestId('shadow-domain') as HTMLInputElement).value).toBe('www.baidu.com'))
    fireEvent.change(screen.getByTestId('shadow-domain'), { target: { value: 'draft.com' } })
    expect(form.getValue('info').domain).toBe('www.baidu.com')
    fireEvent.click(screen.getByText(/^取\s*消$/))
    expect(form.getValue('info').domain).toBe('www.baidu.com')
    expect(form.dirty).toBe(false)
    fireEvent.click(screen.getByTestId('open'))
    await waitFor(() => expect((screen.getByTestId('shadow-domain') as HTMLInputElement).value).toBe('www.baidu.com'))
    fireEvent.change(screen.getByTestId('shadow-domain'), { target: { value: 'saved.com' } })
    fireEvent.click(screen.getByText(/^确\s*定$/))
    await waitFor(() => expect(form.getValue('info')).toEqual({ domain: 'saved.com', desc: 'ping' }))
  })

  it('ShadowPopconfirm opens from its trigger and confirms', async () => {
    const form = createForm({ initialValues: { info: { name: 'x' } } })
    render(
      <Host form={form}>
        <ObjectField name="info">
          <ShadowPopconfirm trigger={<Button data-testid="pop">改名</Button>}>
            <Field name="name" decorator={[FormItem]}>
              <Input data-testid="pop-name" />
            </Field>
          </ShadowPopconfirm>
        </ObjectField>
      </Host>,
    )
    fireEvent.click(screen.getByTestId('pop'))
    await waitFor(() => expect((screen.getByTestId('pop-name') as HTMLInputElement).value).toBe('x'))
    fireEvent.change(screen.getByTestId('pop-name'), { target: { value: 'y' } })
    fireEvent.click(screen.getByText(/^确\s*定$/))
    await waitFor(() => expect(form.getValue('info').name).toBe('y'))
  })

  it('ShadowForm inline exposes the draft to a render prop and to useShadow', async () => {
    const submitted: unknown[] = []
    function SubmitButton() {
      const shadow = useShadow()
      return (
        <button data-testid="inline-submit" onClick={() => void shadow.confirm()}>
          提交
        </button>
      )
    }
    render(
      <ShadowForm record={{ domain: 'a.com' }} onOk={(values) => void submitted.push(values)}>
        {(shadow) => (
          <>
            <Field name="domain" decorator={[FormItem]}>
              <Input data-testid="inline-domain" />
            </Field>
            <span data-testid="dirty">{String(shadow.visible)}</span>
            <SubmitButton />
          </>
        )}
      </ShadowForm>,
    )
    await waitFor(() => expect((screen.getByTestId('inline-domain') as HTMLInputElement).value).toBe('a.com'))
    fireEvent.change(screen.getByTestId('inline-domain'), { target: { value: 'b.com' } })
    fireEvent.click(screen.getByTestId('inline-submit'))
    await waitFor(() => expect(submitted).toEqual([{ domain: 'b.com' }]))
  })

  it('isolates draft fields from host row scope and host FieldGroup', async () => {
    const form = createForm({ initialValues: { hostField: 'h', list: [{ name: 'row' }] } })
    let groupPaths: () => string[] = () => []
    function Inner() {
      const field = useField('name')
      return <span data-testid="scoped">{String(field.value)}</span>
    }
    function GroupHost() {
      const group = useFieldGroup()
      groupPaths = () => group.paths()
      return (
        <FieldGroup value={group}>
          <Field name="hostField" component={[Input]} />
          <ArrayField name="list">
            {() => (
              <ShadowForm record={{ name: 'draft' }}>
                <Field name="draftOnly" component={[Input]} />
                <Inner />
              </ShadowForm>
            )}
          </ArrayField>
        </FieldGroup>
      )
    }
    render(
      <Host form={form}>
        <GroupHost />
      </Host>,
    )
    await waitFor(() => expect(screen.getByTestId('scoped').textContent).toBe('draft'))
    expect(groupPaths()).toEqual(['hostField', 'list'])
  })

  it('hides OK and uses messages.close in readPretty/readOnly while respecting explicit modalProps/drawerProps footer', async () => {
    const form = createForm({
      initialValues: { info: { domain: 'readonly.dev' } },
      readOnly: true,
      messages: enUS,
    })
    render(
      <Host form={form}>
        <ShadowModal name="info" title="Detail" trigger={<Button data-testid="open-rp-modal">Modal</Button>}>
          <Field name="domain" decorator={[FormItem]} component={[Input]} />
        </ShadowModal>
        <ShadowModal
          name="info"
          title="Custom Modal"
          modalProps={{ footer: <div data-testid="custom-modal-footer">My Modal Footer</div> }}
          trigger={<Button data-testid="open-custom-modal">CustomModal</Button>}
        >
          <Field name="domain" decorator={[FormItem]} component={[Input]} />
        </ShadowModal>
        <ShadowDrawer name="info" title="Drawer Detail" trigger={<Button data-testid="open-rp-drawer">Drawer</Button>}>
          <Field name="domain" decorator={[FormItem]} component={[Input]} />
        </ShadowDrawer>
        <ShadowDrawer
          name="info"
          title="Custom Drawer"
          drawerProps={{ footer: <div data-testid="custom-drawer-footer">My Drawer Footer</div> }}
          trigger={<Button data-testid="open-custom-drawer">CustomDrawer</Button>}
        >
          <Field name="domain" decorator={[FormItem]} component={[Input]} />
        </ShadowDrawer>
      </Host>,
    )

    fireEvent.click(screen.getByTestId('open-rp-modal'))
    await waitFor(() => expect(screen.getByText('Close')).toBeTruthy())
    expect(screen.queryByText('OK')).toBeNull()
    fireEvent.click(screen.getByText('Close'))

    fireEvent.click(screen.getByTestId('open-custom-modal'))
    await waitFor(() => expect(screen.getByTestId('custom-modal-footer').textContent).toBe('My Modal Footer'))

    fireEvent.click(screen.getByTestId('open-rp-drawer'))
    await waitFor(() => expect(screen.getAllByText('Close').length).toBeGreaterThan(0))
    expect(screen.queryByText('OK')).toBeNull()

    fireEvent.click(screen.getByTestId('open-custom-drawer'))
    await waitFor(() => expect(screen.getByTestId('custom-drawer-footer').textContent).toBe('My Drawer Footer'))
  })

  it('reactively updates footer when draft root $pattern switches at runtime and covers ShadowPopconfirm', async () => {
    function SwitchableModal() {
      const shadow = useShadowForm<{ domain: string }>({
        initialValues: { domain: 'live.dev' },
        formOptions: { messages: enUS },
      })
      return (
        <>
          <Button data-testid="toggle-rp" onClick={() => shadow.form.batch((d) => { d.$readOnly = true })}>
            MakeReadOnly
          </Button>
          <ShadowModal shadow={shadow} title="Live" trigger={<Button data-testid="open-live">OpenLive</Button>}>
            <Field name="domain" decorator={[FormItem]} component={[Input]} />
          </ShadowModal>
          <ShadowPopconfirm
            formOptions={{ readOnly: true, messages: enUS }}
            record={{ domain: 'pop.dev' }}
            trigger={<Button data-testid="open-rp-pop">OpenPop</Button>}
          >
            <Field name="domain" decorator={[FormItem]} component={[Input]} />
          </ShadowPopconfirm>
        </>
      )
    }
    render(<SwitchableModal />)
    fireEvent.click(screen.getByTestId('open-live'))
    await waitFor(() => expect(screen.getByText('OK')).toBeTruthy())
    expect(screen.getByText('Cancel')).toBeTruthy()
    fireEvent.click(screen.getByTestId('toggle-rp'))
    await waitFor(() => expect(screen.queryByText('OK')).toBeNull())
    expect(screen.getByText('Close')).toBeTruthy()
    fireEvent.click(screen.getByText('Close'))

    fireEvent.click(screen.getByTestId('open-rp-pop'))
    await waitFor(() => expect(screen.getAllByText('Close').length).toBeGreaterThan(0))
    const popOk = document.querySelector('.ant-popconfirm-buttons .ant-btn-primary') as HTMLElement | null
    expect(popOk?.style.display).toBe('none')
  })
})

describe('ArrayTable + bound ShadowModal & ShadowAddition', () => {
  it('edits the row in-scope and ShadowAddition appends and pages', async () => {
    const form = createForm({
      initialValues: {
        list: [
          { id: 1, domain: 'a.com' },
          { id: 2, domain: 'b.com' },
        ],
      },
    })
    render(
      <Host form={form}>
        <ArrayField
          name="list"
          rowKey="id"
          component={[
            ArrayTable,
            {
              pagination: { pageSize: 2 },
              columns: [
                {
                  key: 'domain',
                  title: '域名',
                  render: () => (
                    <Field name="domain" readOnly decorator={[FormItem]}>
                      <Input />
                    </Field>
                  ),
                },
                {
                  key: 'edit',
                  title: '编辑',
                  render: ({ index }) => (
                    <ShadowModal title="编辑行" trigger={<Button data-testid={`edit-${index}`}>编辑</Button>}>
                      <Field name="domain" decorator={[FormItem]}>
                        <Input data-testid="edit-domain" />
                      </Field>
                    </ShadowModal>
                  ),
                },
              ],
              extra: (
                <ArrayTable.ShadowAddition title="添加条目">
                  <Field name="domain" decorator={[FormItem]}>
                    <Input data-testid="add-domain" />
                  </Field>
                </ArrayTable.ShadowAddition>
              ),
            },
          ]}
        />
      </Host>,
    )
    fireEvent.click(screen.getByTestId('edit-1'))
    await waitFor(() => expect((screen.getByTestId('edit-domain') as HTMLInputElement).value).toBe('b.com'))
    fireEvent.change(screen.getByTestId('edit-domain'), { target: { value: 'bb.com' } })
    fireEvent.click(screen.getByText(/^确\s*定$/))
    await waitFor(() => expect(form.getValue('list')[1]).toEqual({ id: 2, domain: 'bb.com' }))
    fireEvent.click(screen.getByTestId('pro-addition'))
    await waitFor(() => expect(screen.getByTestId('add-domain')).toBeTruthy())
    fireEvent.change(screen.getByTestId('add-domain'), { target: { value: 'c.com' } })
    fireEvent.click(screen.getAllByText(/^确\s*定$/).at(-1)!)
    await waitFor(() => expect(form.getValue('list').map((row) => row.domain)).toEqual(['a.com', 'bb.com', 'c.com']))
    await waitFor(() => expect(screen.getByText('c.com')).toBeTruthy())
  })
})
