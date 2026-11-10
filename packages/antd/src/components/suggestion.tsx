import { Select as AntSelect, Spin, type SelectProps } from 'antd'
import type { EnumOption } from '@shikiform/core/internal'
import { useSuggestion, type SuggestFetcher } from '@shikiform/hooks/internal'
import { connect, mapProps, mapReadPretty } from '../adapter/connect'
import { PreviewText } from '../adapter/preview'

type Labeled = { label: string; value: unknown }

export interface SuggestionViewProps extends Omit<SelectProps, 'value' | 'onChange' | 'options' | 'mode' | 'labelInValue' | 'onSearch' | 'filterOption'> {
  value?: unknown
  onChange?: (value: unknown) => void
  /** Remote search: keyword → options. Aborted when a newer keyword supersedes it. */
  fetch: SuggestFetcher
  /** Debounce in ms. Default 300. */
  debounce?: number
  /** Several values (Ant Design `mode="multiple"`). */
  multiple?: boolean
  /** Hold `{ label, value }` instead of the bare value. */
  labelInValue?: boolean
}

/**
 * Searchable select over {@link useSuggestion} (Pro.formily `Suggestion`). Value shapes:
 * `string` · `{ label, value }` (`labelInValue`) · `string[]` (`multiple`) · `{ label, value }[]` (both).
 */
export function SuggestionView({ value, onChange, fetch, debounce, multiple, labelInValue, ...rest }: SuggestionViewProps) {
  const suggest = useSuggestion({ fetch, debounce })
  const list = value == null || value === '' ? [] : Array.isArray(value) ? value : [value]
  const held: EnumOption[] = labelInValue
    ? (list as Labeled[]).filter((item) => item && typeof item === 'object').map((item) => ({ label: String(item.label), value: item.value }))
    : []
  const options = [...suggest.options]
  for (const option of held) if (!options.some((item) => item.value === option.value)) options.push(option)
  const antValue = labelInValue
    ? (list as Labeled[]).map((item) => ({ label: item.label, value: item.value as string }))
    : (list as string[])
  return (
    <AntSelect
      showSearch
      allowClear
      {...rest}
      mode={multiple ? 'multiple' : undefined}
      labelInValue={labelInValue}
      filterOption={false}
      notFoundContent={suggest.loading ? <Spin size="small" /> : rest.notFoundContent}
      loading={suggest.loading}
      onSearch={(keyword) => suggest.search(keyword)}
      options={options.map((option) => ({ label: option.label, value: option.value as string }))}
      value={multiple ? antValue : (antValue[0] ?? undefined)}
      onChange={(next: unknown) => {
        const picked = next == null ? [] : Array.isArray(next) ? next : [next]
        if (labelInValue) {
          const normalized = (picked as Labeled[]).map((item) => ({ label: String(item.label), value: item.value }))
          suggest.remember(normalized)
          onChange?.(multiple ? normalized : (normalized[0] ?? undefined))
          return
        }
        suggest.remember(options.filter((option) => (picked as unknown[]).includes(option.value)))
        onChange?.(multiple ? picked : (picked[0] ?? undefined))
      }}
    />
  )
}

function SuggestionPreview({ value }: { value?: unknown }) {
  const list = value == null ? [] : Array.isArray(value) ? value : [value]
  const text = list.map((item) => (item && typeof item === 'object' ? String((item as Labeled).label) : String(item)))
  return <PreviewText value={text} />
}

/**
 * Field-bound {@link SuggestionView}.
 *
 * ```tsx
 * <Field name="keyword" title="淘宝搜索" decorator={[FormItem]} component={[Suggestion, { fetch: search, multiple: true, labelInValue: true }]} />
 * ```
 */
export const Suggestion = connect(SuggestionView, mapProps({ status: 'status' }), mapReadPretty(SuggestionPreview))
