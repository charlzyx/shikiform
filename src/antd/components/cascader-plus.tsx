import { Cascader as AntCascader, type CascaderProps } from 'antd'
import { useEffect, useRef } from 'react'
import { cascaderPaths, useCascaderLabels, useLazyCascader, type CascaderLoader, type CascaderOption } from '../../pro/use-lazy-cascader'
import { connect, mapReadPretty } from '../adapter/connect'

type Key = string | number

export interface CascaderPlusViewProps
  extends Omit<CascaderProps<CascaderOption>, 'value' | 'onChange' | 'options' | 'loadData' | 'multiple'> {
  value?: unknown
  onChange?: (value: unknown) => void
  /** Children of a value path (`[]` is the root). With `all`, `loadData([])` returns the whole tree. */
  loadData: CascaderLoader
  /** `loadData([])` returns the full tree. Default false (lazy). */
  all?: boolean
  multiple?: boolean
  /** Hold `{ label, value }` per level instead of the bare value. */
  labelInValue?: boolean
}

/**
 * Lazy cascader over {@link useLazyCascader} (Pro.formily `CascaderPlus`): one `loadData(path)` for every level,
 * echo of an existing value (each ancestor level is loaded so labels show), `all` for a full tree,
 * `multiple`, and `labelInValue` (`[{ label, value }, …]` per path).
 */
export function CascaderPlusView({ value, onChange, loadData, all, multiple, labelInValue, ...rest }: CascaderPlusViewProps) {
  const paths = cascaderPaths(value, multiple)
  const cascader = useLazyCascader({ load: loadData, all, paths })
  const seen = useRef(JSON.stringify(paths))
  useEffect(() => {
    const next = JSON.stringify(paths)
    if (next === seen.current) return
    seen.current = next
    void cascader.ensure(paths)
  })
  const emit = (picked: Key[] | Key[][] | undefined, selected: CascaderOption[] | CascaderOption[][] | undefined) => {
    if (!picked) return onChange?.(multiple ? [] : undefined)
    if (!labelInValue) return onChange?.(picked)
    const label = (path: CascaderOption[]) => path.map((option) => ({ label: option.label, value: option.value }))
    onChange?.(multiple ? (selected as CascaderOption[][]).map(label) : label(selected as CascaderOption[]))
  }
  const common = {
    changeOnSelect: true,
    style: { width: '100%' },
    ...rest,
    loading: cascader.loading,
    options: cascader.options,
    loadData: all ? undefined : (selected: CascaderOption[]) => void cascader.loadChildren(selected.map((option) => option.value)),
    displayRender: (labels: string[]) => labels.join('/'),
  }
  if (multiple) {
    return (
      <AntCascader
        {...(common as object)}
        multiple
        value={paths}
        onChange={(next: unknown, selected: unknown) => emit(next as Key[][], selected as CascaderOption[][])}
      />
    )
  }
  return (
    <AntCascader<CascaderOption>
      {...(common as object)}
      value={paths[0]}
      onChange={(next: unknown, selected: unknown) => emit(next as Key[] | undefined, selected as CascaderOption[] | undefined)}
    />
  )
}

/** Read view: labels from a `labelInValue` value, or resolved through `loadData` for bare values ({@link useCascaderLabels}). */
function CascaderPreview({ value, multiple, loadData, all }: { value?: unknown; multiple?: boolean; loadData?: CascaderLoader; all?: boolean }) {
  const { labels, loading } = useCascaderLabels({ value, multiple, load: loadData, all })
  return (
    <span data-read-pretty aria-busy={loading || undefined}>
      {labels.map((path) => path.join('/')).join(', ')}
    </span>
  )
}

/**
 * Field-bound {@link CascaderPlusView}. `readPretty` shows labels: a `labelInValue` value carries them; a bare value
 * (`['zj', 'hz']`) is resolved by loading its ancestor levels through the same `loadData`.
 *
 * ```tsx
 * <Field name="area" title="地区" decorator={[FormItem]} component={[CascaderPlus, { loadData: loadArea, labelInValue: true }]} />
 * ```
 */
export const CascaderPlus = connect(CascaderPlusView, mapReadPretty(CascaderPreview))
