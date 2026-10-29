import {
  Checkbox as AntCheckbox,
  DatePicker as AntDatePicker,
  Input as AntInput,
  InputNumber as AntInputNumber,
  Radio as AntRadio,
  Select as AntSelect,
  Switch as AntSwitch,
} from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import type { ComponentProps, ComponentType, FocusEventHandler } from 'react'
import { connect, mapProps, mapReadPretty } from '../adapter/connect'
import { PreviewText } from '../adapter/preview'
import { ChoicePreview, stripPrettyType, type EnumPrettyProps } from './enum-pretty'

/*
 * Ant Design controls wired through `connect`. Each one is only a mapping; the field logic is `useField`.
 * Use them as a `<Field component>`, as children of a `<Field>` / `AppField`, or with `name` / `field` props.
 */

function PasswordPreview({ value }: { value?: unknown }) {
  return <span data-read-pretty>{value == null || value === '' ? '' : '******'}</span>
}

const choice = mapProps({ options: 'options', loading: 'loading', readOnly: 'disabled' }, stripPrettyType)
const pretty = mapReadPretty(ChoicePreview)
/** A choice control also takes `prettyType` for its `readPretty` view. */
function withPretty<C extends ComponentType<any>>(component: C): ComponentType<ComponentProps<C> & EnumPrettyProps> {
  return component as ComponentType<ComponentProps<C> & EnumPrettyProps>
}

/** Text input. `readPretty` shows the text. `Input.TextArea` and `Input.Password` are connected too. */
export const Input = Object.assign(connect(AntInput, mapReadPretty(PreviewText)), {
  TextArea: connect(AntInput.TextArea, mapReadPretty(PreviewText)),
  Password: connect(AntInput.Password, mapReadPretty(PasswordPreview)),
})

/** Number input. Clearing writes `null` (the raw Ant Design value). `readPretty` shows the number. */
export const InputNumber = connect(AntInputNumber, mapReadPretty(PreviewText))

/**
 * Select. `options` default to the field enum (`$enum`, `fields.x.enum`); `loading` follows an async enum.
 * `readPretty` shows labels, or badges / tags with `prettyType`.
 */
export const Select = connect(withPretty(AntSelect), choice, pretty)

/**
 * Ant Design forwards `onBlur` to rc-switch's button although the public `SwitchProps` omit it.
 * Typed here so a caller can listen to blur (the field is marked touched first).
 */
type SwitchWithBlur = ComponentType<ComponentProps<typeof AntSwitch> & { onBlur?: FocusEventHandler<HTMLButtonElement> }>

/** Boolean switch: field value ↔ `checked`. `readOnly` / `readPretty` render it disabled. */
export const Switch = connect(AntSwitch as SwitchWithBlur, mapProps({ value: 'checked', readOnly: 'disabled', status: false }))

/** Single checkbox: field value ↔ `checked`. `Checkbox.Group` binds an array with enum `options`. */
export const Checkbox = Object.assign(connect(AntCheckbox, mapProps({ value: 'checked', readOnly: 'disabled', status: false })), {
  Group: connect(withPretty(AntCheckbox.Group), mapProps({ options: 'options', readOnly: 'disabled', status: false, id: false }, stripPrettyType), pretty),
})

/** `Radio.Group` with enum `options`. `readPretty` shows the selected label (badge / tag with `prettyType`). */
export const Radio = {
  Group: connect(withPretty(AntRadio.Group), mapProps({ options: 'options', readOnly: 'disabled', status: false, id: false }, stripPrettyType), pretty),
}

function toDayjs(value: unknown, format: unknown): Dayjs | null {
  if (value == null || value === '') return null
  if (dayjs.isDayjs(value)) return value
  if (typeof format === 'string' && typeof value === 'string') {
    const parsed = dayjs(value, format)
    if (parsed.isValid()) return parsed
  }
  const parsed = dayjs(value as string | number | Date)
  return parsed.isValid() ? parsed : null
}

function DateRangePreview({ value }: { value?: unknown }) {
  const [start, end] = Array.isArray(value) ? value : []
  return <span data-read-pretty>{start || end ? `${start ?? ''} ~ ${end ?? ''}` : ''}</span>
}

/**
 * Date picker. Like Formily, the field holds the formatted string (`format`, default `YYYY-MM-DD`), not a dayjs
 * object, so values survive `initialValues` cloning, `reset`, and submit. Clearing writes `undefined`.
 * `DatePicker.RangePicker` holds a `[start, end]` string tuple. `readPretty` shows the text.
 */
export const DatePicker = Object.assign(
  connect(
    AntDatePicker,
    mapProps(
      { readOnly: 'disabled', getValueFromEvent: (_date: unknown, text: unknown) => (text ? text : undefined) },
      (props) => ({ ...props, value: toDayjs(props.value, props.format) }),
    ),
    mapReadPretty(PreviewText),
  ),
  {
    RangePicker: connect(
      AntDatePicker.RangePicker,
      mapProps(
        { readOnly: 'disabled', getValueFromEvent: (dates: unknown, texts: unknown) => (dates ? texts : undefined) },
        (props) => ({
          ...props,
          value: Array.isArray(props.value) ? [toDayjs(props.value[0], props.format), toDayjs(props.value[1], props.format)] : null,
        }),
      ),
      mapReadPretty(DateRangePreview),
    ),
  },
)
