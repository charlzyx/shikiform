import { Button, Drawer, Modal, Popconfirm, Space, Spin, type DrawerProps, type ModalProps, type PopconfirmProps } from 'antd'
import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react'
import { engineOf, formatMessage, ShikiUsageError } from '@shikiform/core/internal'
import type { FormInstance, FormMessageKey, MessageArgs, Pattern } from '@shikiform/core/internal'
import { useShadowForm, type ShadowFormApi, type ShadowInit, type UseShadowFormOptions } from '@shikiform/hooks/internal'
import {
  ArrayContext,
  FieldContext,
  FieldGroupContext,
  FormContext,
  IdPrefixProvider,
  RowWrapContext,
  ScopeContext,
  UiNodeContext,
  useAutoIdPrefix,
} from '@shikiform/react/internal'
import { FormGridContext } from '../adapter/form-grid'
import { ClaimContext } from '../adapter/form-item'

const ROOT = { path: '', index: -1 }
const ShadowContext = createContext<ShadowFormApi<any, any> | null>(null)

/** The shadow form a `ShadowForm` / `ShadowModal` / `ShadowDrawer` / `ShadowPopconfirm` renders. */
export function useShadow<TValues = any, TContext = unknown>(): ShadowFormApi<TValues, TContext> {
  const shadow = useContext(ShadowContext)
  if (!shadow) {
    if (process.env.NODE_ENV !== 'production') {
      throw new ShikiUsageError('useShadow() must render inside ShadowForm, ShadowModal, ShadowDrawer, or ShadowPopconfirm.')
    }
    throw new Error('useShadow() must render inside a shadow component')
  }
  return shadow as ShadowFormApi<TValues, TContext>
}

const ids = new WeakMap<object, number>()
let nextId = 0
function idOf(form: FormInstance<any>): number {
  let id = ids.get(form)
  if (id === undefined) ids.set(form, (id = ++nextId))
  return id
}

function useShadowPattern(shadow: ShadowFormApi<any, any>): Pattern {
  const engine = engineOf(shadow.form)
  return useSyncExternalStore(
    (onStoreChange) => engine.subscribePath('', onStoreChange),
    () => engine.binding('').pattern,
    () => engine.binding('').pattern,
  )
}

function useShadowMessage(shadow: ShadowFormApi<any, any>) {
  const host = useContext(FormContext)
  const overrides = engineOf(shadow.form).options.messages ?? host?.options.messages
  return <K extends FormMessageKey>(key: K, ...params: MessageArgs<K>): string => formatMessage(overrides, key, ...params)
}

/**
 * Provide the shadow's draft form to its fields, starting at the root scope and isolating all host field / array /
 * group / grid / layout-claim contexts while inheriting `FieldKit` and `FormLayout`.
 * No `<form>` element: a shadow may sit inside the host `<Form>`. Remounts on every `open()` (fresh engine).
 */
function ShadowBody({ shadow, children }: { shadow: ShadowFormApi<any, any>; children?: ReactNode }) {
  const prefix = useAutoIdPrefix()
  return (
    <ShadowContext.Provider value={shadow}>
      <IdPrefixProvider prefix={prefix}>
        <FormContext.Provider value={engineOf(shadow.form)}>
          <ScopeContext.Provider value={ROOT}>
            <ArrayContext.Provider value={null}>
              <RowWrapContext.Provider value={null}>
                <FieldContext.Provider value={null}>
                  <UiNodeContext.Provider value={null}>
                    <FieldGroupContext.Provider value={null}>
                      <FormGridContext.Provider value={null}>
                        <ClaimContext.Provider value={null}>
                          <div key={idOf(shadow.form)} data-shadow-form>
                            {shadow.loading ? <Spin /> : children}
                          </div>
                        </ClaimContext.Provider>
                      </FormGridContext.Provider>
                    </FieldGroupContext.Provider>
                  </UiNodeContext.Provider>
                </FieldContext.Provider>
              </RowWrapContext.Provider>
            </ArrayContext.Provider>
          </ScopeContext.Provider>
        </FormContext.Provider>
      </IdPrefixProvider>
    </ShadowContext.Provider>
  )
}

/** Props shared by every shadow container. */
export interface ShadowOwnProps<TValues, TContext = unknown> extends Omit<UseShadowFormOptions<TValues, TContext>, 'initialValues'> {
  /** An external shadow (`useShadowForm`). Omit it and the component owns one. */
  shadow?: ShadowFormApi<TValues, TContext>
  /** What the draft opens with when the trigger is clicked (a value or a loader, Pro.formily `initLoader`). */
  record?: ShadowInit<TValues>
  /** Clicking it opens the draft. Omit it to drive `shadow.open()` yourself. */
  trigger?: ReactNode
  /** Draft fields. Relative names start at the draft's root. */
  children?: ReactNode
}

function useOwnedShadow<TValues, TContext>(props: ShadowOwnProps<TValues, TContext>): ShadowFormApi<TValues, TContext> {
  const own = useShadowForm<TValues, TContext>(
    props.shadow
      ? {}
      : {
          name: props.name,
          form: props.form,
          add: props.add,
          rowKey: props.rowKey,
          merge: props.merge,
          fields: props.fields,
          effects: props.effects,
          formOptions: props.formOptions,
          onOk: props.onOk,
          onCancel: props.onCancel,
        },
  )
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
 * Edit a draft in an Ant Design `Modal` (Pro.formily `ShadowModal`). OK validates the draft, runs `onOk` (and writes
 * back when bound), and closes; Cancel discards it. In `readPretty` / `readOnly` the OK button is hidden and Cancel
 * defaults to `messages.close` (unless `modalProps.footer` is passed).
 */
export function ShadowModal<TValues = any, TContext = unknown>(
  props: ShadowOwnProps<TValues, TContext> & {
    modalProps?: Omit<ModalProps, 'open' | 'onOk' | 'onCancel'>
    title?: ReactNode
    okText?: ReactNode
    cancelText?: ReactNode
  },
) {
  const shadow = useOwnedShadow(props)
  const pattern = useShadowPattern(shadow)
  const viewOnly = pattern === 'readPretty' || pattern === 'readOnly'
  const t = useShadowMessage(shadow)
  const hasCustomFooter = !!props.modalProps && 'footer' in props.modalProps
  return (
    <>
      <Trigger trigger={props.trigger} onOpen={() => void shadow.open(props.record)} />
      <Modal
        destroyOnHidden
        okText={props.okText ?? t('ok')}
        cancelText={props.cancelText ?? t(viewOnly ? 'close' : 'cancel')}
        {...props.modalProps}
        footer={
          hasCustomFooter
            ? props.modalProps!.footer
            : viewOnly
              ? (_, { CancelBtn }) => <CancelBtn />
              : undefined
        }
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

/** Same as {@link ShadowModal} in an Ant Design `Drawer` with 取消 / 确定 (or 关闭 in readPretty / readOnly) in its footer. */
export function ShadowDrawer<TValues = any, TContext = unknown>(
  props: ShadowOwnProps<TValues, TContext> & {
    drawerProps?: Omit<DrawerProps, 'open' | 'onClose'>
    title?: ReactNode
    okText?: ReactNode
    cancelText?: ReactNode
  },
) {
  const shadow = useOwnedShadow(props)
  const pattern = useShadowPattern(shadow)
  const viewOnly = pattern === 'readPretty' || pattern === 'readOnly'
  const t = useShadowMessage(shadow)
  const hasCustomFooter = !!props.drawerProps && 'footer' in props.drawerProps
  const defaultFooter = (
    <Space style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <Button onClick={() => shadow.cancel()}>{props.cancelText ?? t(viewOnly ? 'close' : 'cancel')}</Button>
      {viewOnly ? null : (
        <Button
          type="primary"
          loading={shadow.submitting}
          disabled={shadow.loading}
          onClick={() => void shadow.confirm().catch(() => undefined)}
        >
          {props.okText ?? t('ok')}
        </Button>
      )}
    </Space>
  )
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
        footer={hasCustomFooter ? props.drawerProps!.footer : defaultFooter}
      >
        <ShadowBody shadow={shadow}>{props.children}</ShadowBody>
      </Drawer>
    </>
  )
}

/**
 * Edit a small draft inside an Ant Design `Popconfirm` (Pro.formily `ShadowPopconfirm`). The trigger is the
 * Popconfirm's child; confirming validates and runs `onOk` (and writes back when bound), cancelling discards.
 */
export function ShadowPopconfirm<TValues = any, TContext = unknown>(
  props: ShadowOwnProps<TValues, TContext> & {
    popconfirmProps?: Omit<PopconfirmProps, 'open' | 'title' | 'onConfirm' | 'onCancel' | 'onOpenChange'>
    okText?: ReactNode
    cancelText?: ReactNode
  },
) {
  const shadow = useOwnedShadow(props)
  const pattern = useShadowPattern(shadow)
  const viewOnly = pattern === 'readPretty' || pattern === 'readOnly'
  const t = useShadowMessage(shadow)
  const trigger = isValidElement(props.trigger) ? (
    props.trigger
  ) : (
    <Button size="small" type="link">
      {props.trigger ?? t('edit')}
    </Button>
  )
  const userOkButtonProps = props.popconfirmProps?.okButtonProps
  const okButtonProps = viewOnly
    ? {
        ...userOkButtonProps,
        loading: shadow.submitting,
        disabled: shadow.loading,
        style: { display: 'none', ...userOkButtonProps?.style },
      }
    : {
        loading: shadow.submitting,
        disabled: shadow.loading,
        ...userOkButtonProps,
      }
  return (
    <Popconfirm
      icon={null}
      okText={props.okText ?? t('ok')}
      cancelText={props.cancelText ?? t(viewOnly ? 'close' : 'cancel')}
      {...props.popconfirmProps}
      open={shadow.visible}
      title={<ShadowBody shadow={shadow}>{props.children}</ShadowBody>}
      okButtonProps={okButtonProps}
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
 * An inline shadow form (Pro.formily `ShadowForm` used as decorator / component): opens on mount with `record`
 * (or the bound host path), renders its children against the draft, and exposes the draft through a render prop
 * and {@link useShadow}.
 */
export function ShadowForm<TValues = any, TContext = unknown>(
  props: Omit<ShadowOwnProps<TValues, TContext>, 'trigger' | 'children'> & {
    children?: ReactNode | ((shadow: ShadowFormApi<TValues, TContext>) => ReactNode)
  },
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
