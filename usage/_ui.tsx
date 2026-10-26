// _ui.tsx —— 应用自己的“表单 UI 层”（shadcn 风格，复制粘贴进业务仓库）
// ⚠️ 本轮是 API 设计：本文件和所有 usage/*.tsx 都是“假代码”，不能运行，shikiform 尚无实现。
//
// 目的：说明 ShikiForm 核心是 headless 的，Decorator / Component 由应用自己接。
// 其他 usage 文件都从这里 import Input / Select / FormItem 等。
import type { ReactNode } from 'react';
import { connect, useDecorator, type DecoratorProps } from 'shikiform';
// 下面这些是业务仓库里 shadcn 生成的组件，本身不认识 ShikiForm
import { Input as UIInput } from '@/components/ui/input';
import { Textarea as UITextarea } from '@/components/ui/textarea';
import { Switch as UISwitch } from '@/components/ui/switch';
import { Checkbox as UICheckbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select as UISelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DateRangePicker as UIDateRange } from '@/components/ui/date-range-picker';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// ---------- Component：只消化 value / onChange / options / disabled ----------
// Field 会给子组件注入统一的 props：
//   { value, onChange, onBlur, disabled, readOnly, options, status, id }
// connect 负责把统一 props 映射到具体组件的 props 名上。

export const Input = connect(UIInput, {
  // shadcn Input 是原生 input：onChange 拿到的是事件，要取 target.value
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => e.target.value,
});

export const Textarea = connect(UITextarea, {
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => e.target.value,
});

export const NumberInput = connect(UIInput, {
  mapProps: (p) => ({ ...p, type: 'number', inputMode: 'decimal' }),
  onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
    e.target.value === '' ? undefined : Number(e.target.value),
});

// ❓ shadcn 的 Select / Switch / Checkbox 用 onValueChange / onCheckedChange，不是 onChange。
//    每个都要写一次 connect 映射；这一步省不掉，但只在应用里写一次。
export const Switch = connect(UISwitch, { value: 'checked', onChange: 'onCheckedChange' });
export const Checkbox = connect(UICheckbox, { value: 'checked', onChange: 'onCheckedChange' });

export const Select = connect(
  (p: { value?: string; onValueChange: (v: string) => void; options?: { label: string; value: string; disabled?: boolean }[]; disabled?: boolean; placeholder?: string }) => (
    <UISelect value={p.value} onValueChange={p.onValueChange} disabled={p.disabled}>
      <SelectTrigger>
        <SelectValue placeholder={p.placeholder} />
      </SelectTrigger>
      <SelectContent>
        {p.options?.map((o) => (
          <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </UISelect>
  ),
  { onChange: 'onValueChange' },
);

export const Radio = connect(
  (p: { value?: string; onValueChange: (v: string) => void; options?: { label: string; value: string; disabled?: boolean }[] }) => (
    <RadioGroup value={p.value} onValueChange={p.onValueChange} className="flex gap-4">
      {p.options?.map((o) => (
        <label key={o.value} className="flex items-center gap-1">
          <RadioGroupItem value={o.value} disabled={o.disabled} /> {o.label}
        </label>
      ))}
    </RadioGroup>
  ),
  { onChange: 'onValueChange' },
);

export const DateRange = connect(UIDateRange, { onChange: 'onRangeChange' });

// ---------- Decorator：只消化 label / required / errors / help / 布局 ----------
// useDecorator() 读当前 UI 实例 + 字段状态：label、required、errors、warnings、
// validating、visible（不可见时 Decorator 根本不会被渲染）、pattern。
export function FormItem(props: DecoratorProps & { label?: ReactNode; help?: ReactNode; inline?: boolean; children?: ReactNode }) {
  const d = useDecorator(props);
  return (
    <div className={cn('grid gap-1.5', props.inline && 'grid-cols-[120px_1fr] items-center')}>
      {props.label && (
        <Label htmlFor={d.id}>
          {props.label}
          {d.required && <span className="text-destructive">*</span>}
        </Label>
      )}
      {props.children}
      {d.validating && <p className="text-xs text-muted-foreground">校验中…</p>}
      {d.errors.map((e) => (
        <p key={e} className="text-xs text-destructive">{e}</p>
      ))}
      {props.help && <p className="text-xs text-muted-foreground">{props.help}</p>}
    </div>
  );
}

// 表格单元格用的 Decorator：无 label，错误用红框 + tooltip
export function CellItem(props: DecoratorProps & { children?: ReactNode }) {
  const d = useDecorator(props);
  return (
    <div className={cn(d.errors.length > 0 && 'ring-1 ring-destructive rounded')} title={d.errors.join('\n')}>
      {props.children}
    </div>
  );
}

// 默认的只读展示（pattern = readPretty 且 Field 没给 pretty 时用）
export function TextPretty(props: { value?: unknown }) {
  return <span>{props.value == null || props.value === '' ? '—' : String(props.value)}</span>;
}

export function Money(props: { value?: number }) {
  return <span className="tabular-nums">{props.value == null ? '—' : `¥${props.value.toFixed(2)}`}</span>;
}
