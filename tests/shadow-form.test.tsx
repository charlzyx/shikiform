// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { Button } from 'antd'
import { afterEach, describe, expect, it } from 'vitest'
import { createForm, Form, RowScope, useField } from '../src'
import { FormItem, Input, ProArrayTable, ShadowForm, ShadowModal, ShadowPopconfirm, useShadow } from '../src/antd'
import { useArrayShadow, useShadowForm } from '../src/pro'
import type { ReactNode } from 'react'

afterEach(cleanup)

describe('useShadowForm', () => {
  it('opens a fresh draft per open, validates on confirm, and never writes the host by itself', async () => {
    const seen: unknown[] = []
    const { result } = renderHook(() =>
      useShadowForm<{ domain: string }>({ fields: { domain: { required: true } }, onOk: (values) => void seen.push(values) }),
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
})

function Host({ form, children }: { form: ReturnType<typeof createForm<any>>; children: ReactNode }) {
  return <Form form={form}>{children}</Form>
}

describe('Shadow components', () => {
  it('ShadowModal edits a copy and writes back only on OK', async () => {
    const form = createForm({ initialValues: { info: { domain: 'www.baidu.com', desc: 'ping' } } })
    render(
      <Host form={form}>
        <ShadowModal
          title="编辑"
          record={() => form.getValue('info')}
          onOk={(values) => form.setValue('info', values as never)}
          trigger={<Button data-testid="open">编辑</Button>}
        >
          <FormItem name="domain" label="域名">
            <Input data-testid="shadow-domain" />
          </FormItem>
        </ShadowModal>
      </Host>,
    )
    fireEvent.click(screen.getByTestId('open'))
    await waitFor(() => expect((screen.getByTestId('shadow-domain') as HTMLInputElement).value).toBe('www.baidu.com'))
    fireEvent.change(screen.getByTestId('shadow-domain'), { target: { value: 'draft.com' } })
    expect(form.getValue('info').domain).toBe('www.baidu.com')
    fireEvent.click(screen.getByText('Cancel'))
    expect(form.getValue('info').domain).toBe('www.baidu.com')
    fireEvent.click(screen.getByTestId('open'))
    await waitFor(() => expect((screen.getByTestId('shadow-domain') as HTMLInputElement).value).toBe('www.baidu.com'))
    fireEvent.change(screen.getByTestId('shadow-domain'), { target: { value: 'saved.com' } })
    fireEvent.click(screen.getByText('OK'))
    await waitFor(() => expect(form.getValue('info')).toEqual({ domain: 'saved.com', desc: 'ping' }))
  })

  it('ShadowPopconfirm opens from its trigger and confirms', async () => {
    const form = createForm({ initialValues: { name: 'x' } })
    render(
      <Host form={form}>
        <ShadowPopconfirm record={() => ({ name: form.getValue('name') })} onOk={(values: any) => form.setValue('name', values.name)} trigger={<Button data-testid="pop">改名</Button>}>
          <FormItem name="name"><Input data-testid="pop-name" /></FormItem>
        </ShadowPopconfirm>
      </Host>,
    )
    fireEvent.click(screen.getByTestId('pop'))
    await waitFor(() => expect((screen.getByTestId('pop-name') as HTMLInputElement).value).toBe('x'))
    fireEvent.change(screen.getByTestId('pop-name'), { target: { value: 'y' } })
    fireEvent.click(screen.getByText('OK'))
    await waitFor(() => expect(form.getValue('name')).toBe('y'))
  })

  it('ShadowForm inline exposes the draft to a render prop and to useShadow', async () => {
    const submitted: unknown[] = []
    function SubmitButton() {
      const shadow = useShadow()
      return <button data-testid="inline-submit" onClick={() => void shadow.confirm()}>提交</button>
    }
    render(
      <ShadowForm record={{ domain: 'a.com' }} onOk={(values) => void submitted.push(values)}>
        {(shadow) => (
          <>
            <FormItem name="domain"><Input data-testid="inline-domain" /></FormItem>
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

  it('a shadow opened from a row does not inherit the row scope', async () => {
    const form = createForm({ initialValues: { list: [{ name: 'row' }] } })
    function Inner() {
      const field = useField('name')
      return <span data-testid="scoped">{String(field.value)}</span>
    }
    render(
      <Host form={form}>
        <RowScope path="list.0" index={0}>
          <ShadowForm record={{ name: 'draft' }}>
            <Inner />
          </ShadowForm>
        </RowScope>
      </Host>,
    )
    await waitFor(() => expect(screen.getByTestId('scoped').textContent).toBe('draft'))
  })
})

describe('useArrayShadow + ProArrayTable', () => {
  it('edits the row it opened for and ProAddition appends and pages', async () => {
    const form = createForm({ initialValues: { list: [{ id: 1, domain: 'a.com' }, { id: 2, domain: 'b.com' }] } })
    function Page() {
      const editor = useArrayShadow<{ id: number; domain: string }>('list', { rowKey: 'id' })
      return (
        <>
          <ProArrayTable
            name="list"
            rowKey="id"
            pagination={{ pageSize: 2 }}
            columns={[
              { key: 'domain', title: '域名', render: () => <FormItem name="domain" pattern="readPretty"><Input /></FormItem> },
              { key: 'edit', title: '编辑', render: ({ index }) => <Button data-testid={`edit-${index}`} onClick={() => void editor.edit(index)}>编辑</Button> },
            ]}
            extra={
              <ProArrayTable.ProAddition title="添加条目">
                <FormItem name="domain"><Input data-testid="add-domain" /></FormItem>
              </ProArrayTable.ProAddition>
            }
          />
          <ShadowModal shadow={editor} title="编辑行">
            <FormItem name="domain"><Input data-testid="edit-domain" /></FormItem>
          </ShadowModal>
        </>
      )
    }
    render(<Host form={form}><Page /></Host>)
    fireEvent.click(screen.getByTestId('edit-1'))
    await waitFor(() => expect((screen.getByTestId('edit-domain') as HTMLInputElement).value).toBe('b.com'))
    fireEvent.change(screen.getByTestId('edit-domain'), { target: { value: 'bb.com' } })
    fireEvent.click(screen.getByText('OK'))
    await waitFor(() => expect(form.getValue('list')[1]).toEqual({ id: 2, domain: 'bb.com' }))
    fireEvent.click(screen.getByTestId('pro-addition'))
    await waitFor(() => expect(screen.getByTestId('add-domain')).toBeTruthy())
    fireEvent.change(screen.getByTestId('add-domain'), { target: { value: 'c.com' } })
    fireEvent.click(screen.getAllByText('OK').at(-1)!)
    await waitFor(() => expect(form.getValue('list').map((row) => row.domain)).toEqual(['a.com', 'bb.com', 'c.com']))
    await waitFor(() => expect(screen.getByText('c.com')).toBeTruthy())
  })
})
