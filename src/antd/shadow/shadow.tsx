import { Button, Drawer, Modal, Popconfirm, Space, Spin, type DrawerProps, type ModalProps, type PopconfirmProps } from 'antd'
import { cloneElement, createContext, isValidElement, useContext, useEffect, useRef, type ReactElement, type ReactNode } from 'react'
import type { FormEngine } from '../../core/engine/form-engine'
import { useShadowForm, type ShadowFormApi, type ShadowInit, type UseShadowFormOptions } from '../../pro/use-shadow-form'
import { FormContext, ScopeContext } from '../../react/context'
import { useFormMessage } from '../../react/hooks/use-form-message'

const ROOT = { path: '', index: -1 }
const ShadowContext = createContext<ShadowFormApi<any, any> | null>(null)

/** The shadow form a `ShadowForm` / `ShadowModal` / `ShadowDrawer` / `ShadowPopconfirm` renders. */
export function useShadow<TValues = any, TContext = unknown>(): ShadowFormApi<TValues, TContext> {
  const shadow = useContext(ShadowContext)
  if (!shadow) throw new Error('useShadow must render inside ShadowForm, ShadowModal, ShadowDrawer, or ShadowPopconfirm')
  return shadow as ShadowFormApi<TValues, TContext>
}

const ids = new WeakMap<object, number>()
let nextId = 0
function idOf(form: FormEngine<any>): number {
  let id = ids.get(form)
  if (id === undefined) ids.set(form, (id = ++nextId))
  return id
}

/**
 * Provide the shadow's draft form to its fields, starting at the root scope (not the host row's scope).
 * No `<form>` element: a shadow may sit inside the host `<Form>`. Remounts on every `open()` (fresh engine).
 */
function ShadowBody({ shadow, children }: { shadow: ShadowFormApi<any, any>; children?: ReactNode }) {
  return (
    <ShadowContext.Provider value={shadow}>
      <FormContext.Provider value={shadow.form}>
        <ScopeContext.Provider value={ROOT}>
          <div key={idOf(shadow.form)} data-shadow-form>
            {shadow.loading ? <Spin /> : children}
          </div>
        </ScopeContext.Provider>
      </FormContext.Provider>
    </ShadowContext.Provider>
  )
}

/** Props shared by every shadow container. */
export interface ShadowOwnProps<TValues, TContext = unknown> extends Omit<UseShadowFormOptions<TValues, TContext>, 'initialValues'> {
  /** An external shadow (`useShadowForm` / `useArrayShadow`). Omit it and the component owns one. */
  shadow?: ShadowFormApi<TValues, TContext>
  /** What the draft opens with when the trigger is clicked (a value or a loader, Pro.formily `initLoader`). */
  record?: ShadowInit<TValues>
  /** Clicking it opens the draft. Omit it to drive `shadow.open()` yourself. */
  trigger?: ReactNode
  /** Draft fields. Relative names start at the draft's root. */
  children?: ReactNode
}

function useOwnedShadow<TValues, TContext>(props: ShadowOwnProps<TValues, TContext>): ShadowFormApi<TValues, TContext> {
  const own = useShadowForm<TValues, TContext>(props.shadow ? {} : { fields: props.fields, effects: props.effects, formOptions: props.formOptions, onOk: props.onOk, onCancel: props.onCancel })
  return props.shadow ?? own
}

function Trigger({ trigger, onOpen }: { trigger?: ReactNode; onOpen: () => void }) {
  if (trigger === undefined || trigger === null || trigger === false) return null
  if (isValidElement(trigger)) {
    const element = trigger as ReactElement<{ onClick?: (...args: any[]) => void }>
    return cloneElement(element, {
      onClick: (...args: any[]) => {
        element.props.onClick?.(...args)
        onOpen()
      },
    })
  }
  return (
    <Button size="small" type="link" onClick={onOpen}>
      {trigger}
    </Button>
  )
}

/**
 * Edit a draft in an Ant Design `Modal` (Pro.formily `ShadowModal`). OK validates the draft, runs `onOk`, and closes;
 * Cancel discards it. The host form is never written unless `onOk` writes it.
 *
 * ```tsx
 * <ShadowModal title="编辑" record={() => form.getValue('info')} onOk={(v) => form.setValue('info', v)} trigger={<Button>编辑</Button>}>
 *   <Field name="domain" title="域名" decorator={[FormItem]} component={[Input]} />
 * </ShadowModal>
 * ```
 */
export function ShadowModal<TValues = any, TContext = unknown>(
  props: ShadowOwnProps<TValues, TContext> & { modalProps?: Omit<ModalProps, 'open' | 'onOk' | 'onCancel'>; title?: ReactNode },
) {
  const shadow = useOwnedShadow(props)
  return (
    <>
      <Trigger trigger={props.trigger} onOpen={() => void shadow.open(props.record)} />
      <Modal
        destroyOnHidden
        {...props.modalProps}
        title={props.title}
        open={shadow.visible}
        confirmLoading={shadow.submitting}
        okButtonProps={{ disabled: shadow.loading, ...props.modalProps?.okButtonProps }}
        onOk={() => void shadow.confirm().catch(() => undefined)}
        onCancel={() => shadow.cancel()}
      >
        <ShadowBody shadow={shadow}>{props.children}</ShadowBody>
      </Modal>
    </>
  )
}

/** Same as {@link ShadowModal} in an Ant Design `Drawer` with 取消 / 确定 in its footer. */
export function ShadowDrawer<TValues = any, TContext = unknown>(
  props: ShadowOwnProps<TValues, TContext> & { drawerProps?: Omit<DrawerProps, 'open' | 'onClose'>; title?: ReactNode; okText?: ReactNode; cancelText?: ReactNode },
) {
  const shadow = useOwnedShadow(props)
  const t = useFormMessage()
  return (
    <>
      <Trigger trigger={props.trigger} onOpen={() => void shadow.open(props.record)} />
      <Drawer
        destroyOnHidden
        width={480}
        {...props.drawerProps}
        title={props.title}
        open={shadow.visible}
        onClose={() => shadow.cancel()}
        footer={
          <Space style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={() => shadow.cancel()}>{props.cancelText ?? t('cancel')}</Button>
            <Button type="primary" loading={shadow.submitting} disabled={shadow.loading} onClick={() => void shadow.confirm().catch(() => undefined)}>
              {props.okText ?? t('ok')}
            </Button>
          </Space>
        }
      >
        <ShadowBody shadow={shadow}>{props.children}</ShadowBody>
      </Drawer>
    </>
  )
}

/**
 * Edit a small draft inside an Ant Design `Popconfirm` (Pro.formily `ShadowPopconfirm`). The trigger is the
 * Popconfirm's child; confirming validates and runs `onOk`, cancelling discards.
 */
export function ShadowPopconfirm<TValues = any, TContext = unknown>(
  props: ShadowOwnProps<TValues, TContext> & { popconfirmProps?: Omit<PopconfirmProps, 'open' | 'title' | 'onConfirm' | 'onCancel' | 'onOpenChange'> },
) {
  const shadow = useOwnedShadow(props)
  const t = useFormMessage()
  const trigger = isValidElement(props.trigger) ? props.trigger : (
    <Button size="small" type="link">
      {props.trigger ?? t('edit')}
    </Button>
  )
  return (
    <Popconfirm
      icon={null}
      {...props.popconfirmProps}
      open={shadow.visible}
      title={<ShadowBody shadow={shadow}>{props.children}</ShadowBody>}
      okButtonProps={{ loading: shadow.submitting, disabled: shadow.loading }}
      onOpenChange={(next) => {
        if (next && !shadow.visible) void shadow.open(props.record)
        if (!next && shadow.visible && !shadow.submitting) shadow.cancel()
      }}
      onConfirm={() => shadow.confirm().then(() => undefined, () => undefined)}
      onCancel={() => shadow.cancel()}
    >
      {trigger}
    </Popconfirm>
  )
}

/**
 * An inline shadow form (Pro.formily `ShadowForm` used as decorator / component): opens on mount with `record`,
 * renders its children against the draft, and exposes the draft through a render prop and {@link useShadow},
 * so a custom container can put its own submit button anywhere below it.
 *
 * ```tsx
 * <ShadowForm record={info} onOk={save}>
 *   {(shadow) => <>…fields… <Button onClick={() => shadow.confirm()}>提交</Button></>}
 * </ShadowForm>
 * ```
 */
export function ShadowForm<TValues = any, TContext = unknown>(
  props: Omit<ShadowOwnProps<TValues, TContext>, 'trigger' | 'children'> & { children?: ReactNode | ((shadow: ShadowFormApi<TValues, TContext>) => ReactNode) },
) {
  const shadow = useOwnedShadow(props as ShadowOwnProps<TValues, TContext>)
  const opened = useRef(false)
  useEffect(() => {
    if (opened.current) return
    opened.current = true
    if (!shadow.visible) void shadow.open(props.record)
  }, [])
  const children = typeof props.children === 'function' ? props.children(shadow) : props.children
  return <ShadowBody shadow={shadow}>{children}</ShadowBody>
}
