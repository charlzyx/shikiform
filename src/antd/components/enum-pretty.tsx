import { Badge, Space, Tag } from 'antd'
import type { ReactNode } from 'react'
import type { EnumOption } from '../../core/enum/enum-source'
import { enumItems } from '../../pro/enum-pretty'
import { connect, mapProps } from '../adapter/connect'
import { PreviewText } from '../adapter/preview'

/** How an enum value is drawn: plain labels, colored badges, or colored tags. */
export type EnumShowType = 'text' | 'badge' | 'tag'

export interface EnumPrettyViewProps {
  value?: unknown
  options?: readonly EnumOption[]
  /** Default `text`. */
  showType?: EnumShowType
  /** `===` matching instead of loose `==`. */
  strict?: boolean
  /** Palette colors for options without `color`. Default true. */
  colorful?: boolean
  /** Shown when nothing matches. Default `-`. */
  empty?: ReactNode
}

/**
 * Enum value(s) as labels, badges, or tags (Pro.formily `EnumReadPretty`). Pure view; colors come from
 * each option's `color` (named: `success`, `processing`, `error`, `warning`…) or a palette by position.
 */
export function EnumPrettyView({ value, options, showType = 'text', strict, colorful, empty = '-' }: EnumPrettyViewProps) {
  const items = enumItems(value, options, { strict, colorful })
  if (!items.length) return <span data-read-pretty>{empty}</span>
  return (
    <Space size="small" data-read-pretty data-enum-pretty={showType}>
      {items.map((item) =>
        showType === 'badge' ? (
          <Badge key={String(item.value)} color={item.color} text={item.label} />
        ) : showType === 'tag' ? (
          <Tag key={String(item.value)} color={item.color}>
            {item.label}
          </Tag>
        ) : (
          <span key={String(item.value)}>{item.label}</span>
        ),
      )}
    </Space>
  )
}

/**
 * Field-bound {@link EnumPrettyView} (Pro.formily `ProEnumPretty`): reads the field value and its enum
 * (`fields.x.enum`, `$enum`, an `EnumSource`). Always read-only.
 *
 * ```tsx
 * <FormItem name="status" label="状态"><EnumPretty showType="badge" /></FormItem>
 * ```
 */
export const EnumPretty = connect(
  EnumPrettyView,
  mapProps({ options: 'options', onChange: false, onBlur: false, disabled: false, readOnly: false, status: false, id: false }),
)

/** Extra prop the choice controls (`Select`, `Radio.Group`, `Checkbox.Group`) accept for their `readPretty` view. */
export interface EnumPrettyProps {
  /** Draw `readPretty` as text (default), badges, or tags. Ignored while editable. */
  prettyType?: EnumShowType
}

/** `readPretty` view of the choice controls: `PreviewText`, or {@link EnumPrettyView} when `prettyType` is set. */
export function ChoicePreview(props: Record<string, any>) {
  if (props.prettyType) return <EnumPrettyView value={props.value} options={props.options} showType={props.prettyType} empty={props.placeholder ?? ''} />
  return <PreviewText {...props} />
}

/** Drop `prettyType` before it reaches an editable Ant Design control. */
export function stripPrettyType(props: Record<string, any>): Record<string, any> {
  if (!('prettyType' in props)) return props
  const { prettyType: _drop, ...rest } = props
  return rest
}
