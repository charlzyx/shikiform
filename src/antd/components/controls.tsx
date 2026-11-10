import {
  AutoComplete as AntAutoComplete,
  Cascader as AntCascader,
  Checkbox as AntCheckbox,
  ColorPicker as AntColorPicker,
  DatePicker as AntDatePicker,
  Input as AntInput,
  InputNumber as AntInputNumber,
  Radio as AntRadio,
  Rate as AntRate,
  Select as AntSelect,
  Slider as AntSlider,
  Space,
  Switch as AntSwitch,
  TimePicker as AntTimePicker,
  Transfer as AntTransfer,
  TreeSelect as AntTreeSelect,
  Upload as AntUpload,
} from 'antd'
import type { UploadFile } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat.js'
import { Children, cloneElement, Fragment, isValidElement, type ComponentProps, type ComponentType, type FocusEventHandler, type ReactElement, type ReactNode } from 'react'
import { useFormMessage } from '../../react/hooks/use-form-message'
import { connect, mapBlur, mapProps, mapReadPretty, type ComponentStatics } from '../adapter/connect'
import { isEmptyValue, PreviewText, type PreviewTextProps, type PrettyType } from '../adapter/preview'

dayjs.extend(customParseFormat)

/*
 * Ant Design controls wired through `connect`. Each one is only a mapping plus a read view (`PreviewText.*`);
 * the field logic is `useField`. Use them as a `<Field component>`, as children of a `<Field>`, or with `name` /
 * `field` props. Options default to the field enum (`<Field enum>`, `fields.x.enum`, `$enum`).
 */

/** Extra prop the choice controls (`Select`, `Radio`, `Checkbox.Group`, `TreeSelect`) accept for their read view. */
export interface PrettyTypeProps {
  /** `readPretty` as text (one value; several are tags), `badge`, or colored `tag`. Ignored while editable. */
  prettyType?: PrettyType
}

/** Drop `prettyType` before it reaches an editable Ant Design control. */
function stripPrettyType(props: Record<string, any>): Record<string, any> {
  if (!('prettyType' in props)) return props
  const { prettyType: _drop, ...rest } = props
  return rest
}

/** A choice control also takes `prettyType` for its `readPretty` view. */
function withPretty<C extends ComponentType<any>>(component: C): ComponentStatics<C> & ComponentType<ComponentProps<C> & PrettyTypeProps> {
  return component as unknown as ComponentStatics<C> & ComponentType<ComponentProps<C> & PrettyTypeProps>
}

/** Ant Design `status` ('error' | 'warning'). Headless connect does not pass this. */
const antdStatus = { status: 'status' as const }

const choice = mapProps({ options: 'options', loading: 'loading', readOnly: 'disabled', ...antdStatus }, stripPrettyType)

/** Marks a grouped `Checkbox` so it does not copy the field id onto every option. */
const OPTION_KEEP = Symbol('shiki-option-keep')
const OPTION_DROP = Symbol('shiki-option-drop')

/**
 * Ant Design puts a group `id` on the wrapper div, which `<label htmlFor>` cannot activate, so the group drops it.
 * The field id goes on the first option that does not already have one — an `options` entry, or a hand-written
 * child (`Radio.Button`, `Checkbox`). That option's `<input>` is what `FormItem`'s label points at, and what a
 * failed submit focuses.
 */
function labelFirstOption(props: Record<string, any>, field: { id?: string }): Record<string, any> {
  const id = field.id
  if (!id || props.id === id) return props
  const options = props.options
  if (Array.isArray(options) && options.length > 0) {
    let stamped = false
    let changed = false
    const next = options.map((option) => {
      if (stamped || option == null) return option
      if (typeof option !== 'object') {
        stamped = true
        changed = true
        return { label: option, value: option, id }
      }
      if (option.id) {
        if (option.id === id) stamped = true
        return option
      }
      stamped = true
      changed = true
      return { ...option, id }
    })
    return changed ? { ...props, options: next } : props
  }
  if (props.children == null) return props
  const children = stampOptionChildren(props.children, id)
  return children === props.children ? props : { ...props, children }
}

/**
 * `Checkbox` reads the surrounding field and would put the field id on every option. The group stamps the field
 * id on the first option that has none; the rest drop that copied id and keep an id they already had.
 */
function dropGroupedCheckboxId(props: Record<string, any>, field: { id?: string }): Record<string, any> {
  if (OPTION_KEEP in props) {
    const next = { ...props }
    delete next[OPTION_KEEP]
    return next
  }
  if (!(OPTION_DROP in props)) return props
  const next = { ...props }
  delete next[OPTION_DROP]
  if (next.id === field.id) delete next.id
  return next
}

/** The connected `Checkbox`, set after it is created. Compared by identity when stamping group children. */
let checkboxType: ComponentType<any> | undefined

function stampOptionChildren(children: ReactNode, id: string): ReactNode {
  let stamped = false
  const visit = (nodes: ReactNode): ReactNode => Children.map(nodes, (child) => {
    if (!isValidElement(child)) return child
    if (child.type === Fragment) return cloneElement(child, {}, visit((child.props as { children?: ReactNode }).children))
    const props = child.props as { id?: string }
    const box = checkboxType != null && child.type === checkboxType
    if (!stamped && (!props.id || props.id === id)) {
      stamped = true
      const extra: { id: string; [OPTION_KEEP]?: true } = { id }
      if (box) extra[OPTION_KEEP] = true
      return cloneElement(child as ReactElement<{ id?: string }>, extra)
    }
    if (box) return cloneElement(child as ReactElement<Record<string, unknown>>, { [OPTION_DROP]: true })
    return child
  })
  return visit(children)
}

const group = mapProps(
  { options: 'options', readOnly: 'disabled', status: false, id: false },
  stripPrettyType,
  labelFirstOption,
)

function TextAreaPreview(props: PreviewTextProps) {
  if (isEmptyValue(props.value)) return <PreviewText.Empty empty={props.empty} />
  return <span data-read-pretty style={{ whiteSpace: 'pre-wrap' }}>{String(props.value)}</span>
}

/** Text input; `readPretty` shows the text with `addonBefore` / `prefix` / `suffix` / `addonAfter`. `.TextArea` keeps line breaks; `.Password` is masked. */
export const Input = Object.assign(connect(AntInput, mapProps(antdStatus), mapReadPretty(PreviewText.Input)), {
  TextArea: connect(AntInput.TextArea, mapProps(antdStatus), mapReadPretty(TextAreaPreview)),
  Password: connect(AntInput.Password, mapProps(antdStatus), mapReadPretty(PreviewText.Password)),
})

/** Number input. Clearing writes `null` (the raw Ant Design value). `readPretty` applies `formatter` and the addons. */
export const InputNumber = connect(AntInputNumber, mapProps(antdStatus), mapReadPretty(PreviewText.Input))

/**
 * Select. `options` default to the field enum; `loading` follows an async enum.
 * `readPretty` shows labels (several as tags), or badges / colored tags with `prettyType`.
 */
export const Select = connect(withPretty(AntSelect), choice, mapReadPretty(PreviewText.Select))

/** Text input with suggestions (free text; the value need not be an option). `options` default to the field enum. */
export const AutoComplete = connect(AntAutoComplete, mapProps({ options: 'options', readOnly: 'disabled', ...antdStatus }), mapReadPretty(PreviewText.Input))

/**
 * Tree select. `treeData` defaults to the field enum (`{ label, value, children }` nodes); `multiple` /
 * `treeCheckable` hold an array. `readPretty` shows the labels found in the tree.
 */
export const TreeSelect = connect(
  withPretty(AntTreeSelect),
  mapProps({ options: 'treeData', loading: 'loading', readOnly: 'disabled', ...antdStatus }, stripPrettyType),
  mapReadPretty(PreviewText.TreeSelect),
)

/**
 * Cascader: the value is the path (`['zj', 'hz']`; `multiple`: a list of paths). `options` default to the field enum
 * (`{ label, value, children }`). `readPretty` shows `label / label`. For children loaded level by level use `CascaderPlus`.
 */
export const Cascader = connect(AntCascader, mapProps({ options: 'options', loading: 'loading', readOnly: 'disabled', ...antdStatus }), mapReadPretty(PreviewText.Cascader))

/**
 * Ant Design forwards `onBlur` to rc-switch's button although the public `SwitchProps` omit it.
 * Typed here so a caller can listen to blur (the field is marked touched first).
 */
type SwitchWithBlur = ComponentType<ComponentProps<typeof AntSwitch> & { onBlur?: FocusEventHandler<HTMLButtonElement> }>

function BooleanPreview({ value, checkedChildren, unCheckedChildren }: PreviewTextProps) {
  const t = useFormMessage()
  const on = !!value
  const text = on ? (checkedChildren ?? t('yes')) : (unCheckedChildren ?? t('no'))
  return <span data-read-pretty>{text as React.ReactNode}</span>
}

/** Boolean switch: field value ↔ `checked`. `readPretty` shows `checkedChildren` / `unCheckedChildren`, else `messages.yes` / `no`. */
export const Switch = connect(AntSwitch as SwitchWithBlur, mapProps({ value: 'checked', readOnly: 'disabled', status: false }), mapReadPretty(BooleanPreview))

/**
 * Single checkbox: field value ↔ `checked`; `readPretty` shows `messages.yes` / `no`.
 * `Checkbox.Group` binds an array with enum `options`; `readPretty` shows the labels as tags.
 */
export const Checkbox = Object.assign(
  connect(AntCheckbox, mapProps({ value: 'checked', readOnly: 'disabled', status: false }, dropGroupedCheckboxId), mapReadPretty(BooleanPreview)),
  { Group: connect(withPretty(AntCheckbox.Group), group, mapReadPretty(PreviewText.Select)) },
)
checkboxType = Checkbox

const RadioGroup = connect(withPretty(AntRadio.Group), group, mapReadPretty(PreviewText.Select))

/**
 * Radio group with enum `options`; `Radio` and `Radio.Group` are the same control (`component={[Radio]}` works).
 * A single yes/no radio is a `Checkbox` / `Switch` job. `Radio.Button` is Ant Design's, for `optionType="button"` children.
 * `readPretty` shows the selected label (badge / tag with `prettyType`).
 */
export const Radio = Object.assign(RadioGroup, { Group: RadioGroup, Button: AntRadio.Button })

function toDayjs(value: unknown, format: unknown): Dayjs | null {
  if (value == null || value === '') return null
  if (dayjs.isDayjs(value)) return value
  const formats = (Array.isArray(format) ? format : [format]).filter((item): item is string => typeof item === 'string')
  if (typeof value === 'string') {
    for (const item of formats) {
      const parsed = dayjs(value, item, true)
      if (parsed.isValid()) return parsed
    }
  }
  const parsed = dayjs(value as string | number | Date)
  return parsed.isValid() ? parsed : null
}

/**
 * A picker that holds text: the field value is the formatted string (`format`), never a dayjs object, so values
 * survive `initialValues` cloning, `reset`, and submit. Clearing writes `undefined`.
 */
/**
 * Date picker. Like Formily, the field holds the formatted string (`format`, default `YYYY-MM-DD`), not a dayjs
 * object. `format` / `parse` on `mapProps` do the conversion. `DatePicker.RangePicker` holds a `[start, end]`
 * string tuple. `readPretty` shows the text (the field value, not a dayjs).
 */
export const DatePicker = Object.assign(connect(AntDatePicker, mapProps({
  readOnly: 'disabled',
  ...antdStatus,
  format: (value, props) => toDayjs(value, props.format ?? 'YYYY-MM-DD'),
  parse: (_date, text) => (text ? text : undefined),
}), mapReadPretty(PreviewText.DatePicker)), {
  RangePicker: connect(AntDatePicker.RangePicker, mapProps({
    readOnly: 'disabled',
    ...antdStatus,
    format: (value, props) => {
      const format = props.format ?? 'YYYY-MM-DD'
      return Array.isArray(value) ? [toDayjs(value[0], format), toDayjs(value[1], format)] : null
    },
    parse: (dates, texts) => (dates ? texts : undefined),
  }), mapReadPretty(PreviewText.DateRangePicker)),
})

/**
 * Time picker: the field holds the formatted string (`format`, default `HH:mm:ss`). `TimePicker.RangePicker` holds a
 * `[start, end]` tuple. `readPretty` shows the text.
 */
export const TimePicker = Object.assign(connect(AntTimePicker, mapProps({
  readOnly: 'disabled',
  ...antdStatus,
  format: (value, props) => toDayjs(value, props.format ?? 'HH:mm:ss'),
  parse: (_date, text) => (text ? text : undefined),
}), mapReadPretty(PreviewText.TimePicker)), {
  RangePicker: connect(AntTimePicker.RangePicker, mapProps({
    readOnly: 'disabled',
    ...antdStatus,
    format: (value, props) => {
      const format = props.format ?? 'HH:mm:ss'
      return Array.isArray(value) ? [toDayjs(value[0], format), toDayjs(value[1], format)] : null
    },
    parse: (dates, texts) => (dates ? texts : undefined),
  }), mapReadPretty(PreviewText.TimeRangePicker)),
})

/** Slider: a number, or `[from, to]` with `range`. `readPretty` shows the number(s). */
export const Slider = connect(
  AntSlider,
  mapProps({ readOnly: 'disabled', status: false }),
  mapReadPretty(function SliderPreview({ value, empty }: PreviewTextProps) {
    if (isEmptyValue(value)) return <PreviewText.Empty empty={empty} />
    return <span data-read-pretty>{Array.isArray(value) ? `${value[0] ?? ''} ~ ${value[1] ?? ''}` : String(value)}</span>
  }),
)

/** Star rating. `readPretty` shows the stars, not editable (`count`, `allowHalf`, `character` apply). */
export const Rate = connect(
  AntRate,
  mapProps({ readOnly: 'disabled', status: false }),
  mapReadPretty(function RatePreview({ value, empty, count, allowHalf, character }: PreviewTextProps) {
    if (value == null) return <PreviewText.Empty empty={empty} />
    return (
      <span data-read-pretty>
        <AntRate disabled value={Number(value)} count={count as number} allowHalf={allowHalf as boolean} character={character as React.ReactNode} />
      </span>
    )
  }),
)

type TransferItem = { key: string | number; title?: React.ReactNode; disabled?: boolean; [key: string]: unknown }

/** Options (`{ label, value }`) or Ant Design records (`{ key, title }`) → Transfer records. */
function transferItems(source: unknown): TransferItem[] {
  if (!Array.isArray(source)) return []
  return source.map((item: Record<string, any>) => ({ ...item, key: item.key ?? item.value, title: item.title ?? item.label }))
}

/**
 * Transfer: the value is the target keys (option values). `dataSource` defaults to the field enum (`{ label, value }`
 * becomes `{ key, title }`). `readPretty` shows the chosen titles as tags.
 */
export const Transfer = connect(
  AntTransfer,
  mapProps({ value: 'targetKeys', options: 'dataSource', readOnly: 'disabled', id: false, onBlur: false }, (props) => ({
    render: (item: TransferItem) => item.title,
    ...props,
    dataSource: transferItems(props.dataSource),
    targetKeys: Array.isArray(props.targetKeys) ? props.targetKeys : [],
  })),
  mapReadPretty(function TransferPreview(props: PreviewTextProps) {
    const options = transferItems(props.dataSource ?? props.options).map((item) => ({ label: item.title, value: item.key }))
    return <PreviewText.Select value={props.value} options={options} empty={props.empty} />
  }),
)

/**
 * `onChange({ file, fileList })` → the field value. Keeps Ant Design's file objects, drops `xhr` (not cloneable,
 * would break submit), and fills `url` from a `{ url }` response so a finished upload links to its file.
 */
function fileListFromEvent(info: unknown): UploadFile[] {
  const list = Array.isArray(info) ? info : ((info as { fileList?: UploadFile[] } | undefined)?.fileList ?? [])
  return list.map((file: UploadFile) => {
    const { xhr: _xhr, ...rest } = file as UploadFile & { xhr?: unknown }
    const responseUrl = (file.response as { url?: unknown } | undefined)?.url
    return rest.url || typeof responseUrl !== 'string' ? rest : { ...rest, url: responseUrl }
  })
}

/** Upload has no `onBlur`. Kept off the value mapping so the blur decision stays visible to `connect`. */
const uploadBlur = mapProps({ onBlur: false })

function UploadPreview({ value, empty, listType }: PreviewTextProps) {
  if (!Array.isArray(value) || !value.length) return <PreviewText.Empty empty={empty} />
  const pictures = listType === 'picture' || listType === 'picture-card' || listType === 'picture-circle'
  return (
    <Space size={8} wrap={pictures} direction={pictures ? 'horizontal' : 'vertical'} data-read-pretty>
      {(value as UploadFile[]).map((file, index) => {
        const href = file.url ?? file.thumbUrl
        const thumb = file.thumbUrl ?? file.url
        const name = file.name ?? href ?? String(index + 1)
        const body = pictures && thumb ? <img src={thumb} alt={name} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 4 }} /> : name
        return href ? (
          <a key={file.uid ?? index} href={href} target="_blank" rel="noreferrer" title={name}>
            {body}
          </a>
        ) : (
          <span key={file.uid ?? index}>{body}</span>
        )
      })}
    </Space>
  )
}

/**
 * Upload: the value is the file list (Ant Design `UploadFile[]`, `fileList` ↔ value). `Upload.Dragger` is the drop
 * zone. `readPretty` lists the files as links (thumbnails for the picture list types), without trigger or remove buttons.
 */
export const Upload = Object.assign(connect(AntUpload, mapProps({
  value: 'fileList',
  parse: fileListFromEvent,
  format: (value) => (Array.isArray(value) ? value : []),
  readOnly: 'disabled',
  status: false,
  id: false,
}), uploadBlur, mapReadPretty(UploadPreview)), {
  Dragger: connect(AntUpload.Dragger, mapProps({
    value: 'fileList',
    parse: fileListFromEvent,
    format: (value) => (Array.isArray(value) ? value : []),
    readOnly: 'disabled',
    status: false,
    id: false,
  }), uploadBlur, mapReadPretty(UploadPreview)),
})

/** Color picker: the value is the color text (`format`: hex by default; cleared → `undefined`). `readPretty` shows a swatch and the text. */
export const ColorPicker = connect(
  AntColorPicker,
  mapProps({
    readOnly: 'disabled',
    status: false,
    parse: (color, text) => (!color || color.cleared ? undefined : text),
  }),
  // The picker has no `onBlur`; closing the popover is the blur (so `validateTrigger: 'onBlur'` still runs).
  mapBlur('onOpenChange'),
  mapReadPretty(function ColorPreview({ value, empty }: PreviewTextProps) {
    if (isEmptyValue(value)) return <PreviewText.Empty empty={empty} />
    const text = typeof value === 'string' ? value : String((value as { toHexString?: () => string }).toHexString?.() ?? value)
    return (
      <Space size={6} data-read-pretty>
        <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: text, border: '1px solid rgba(0,0,0,0.1)', verticalAlign: 'middle' }} />
        <span>{text}</span>
      </Space>
    )
  }),
)
