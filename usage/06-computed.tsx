// 06 计算值（computed）：报价单
// 覆盖：行级计算值（小计，每行一个 autorun.each 实例）、表单级计算值（合计 / 税 / 应付）、预览地址。
// 2026-10-27 定：Computed 不是字段类型，也没有单独的“计算”声明 API。计算值 = 一个只读 Field，它的 $value 在 autorun 里写：
//      - autorun 写了某字段的 $value → 该字段是计算字段：只读（readPretty）、不脏检查、不校验、reset 时重算
//      - “值从哪来”（输入 / 计算）和“提不提交”（virtual）是两个独立属性：计算字段默认 virtual（不提交），
//        需要提交时在 JSX / fields 里声明 virtual={false}（见 payable）
//      - JSX 里它就是普通 <Field name>，没有 <Computed> 组件
// ⚠️ 假代码：只看 API 是否顺手，不能运行。
import { useForm, useFormState, Form, Field, ArrayField, defineEffects, useRow, Submit } from 'shikiform';
import { FormItem, CellItem, Input, NumberInput, Select, Money } from './_ui';
import { Button } from '@/components/ui/button';
import { nanoid } from 'nanoid';
import { api } from '@/api';

interface QuoteItem {
  id: string;
  sku: string;
  qty: number;
  unitPrice: number;
  discount: number; // 0~1
  subtotal?: number; // 计算字段
}
interface Quote {
  customer: string;
  slug: string;
  taxRate: number;
  items: QuoteItem[];
  // —— 计算字段：在值类型里声明（draft 的类型就是 Draft<Quote>），值由 autorun 写 ——
  subtotal?: number;
  tax?: number;
  payable?: number;
  previewUrl?: string;
}

// 计算值和联动写在一起：autorun 读了什么就依赖什么，按行实例缓存
const quoteEffects = defineEffects<Quote>(({ autorun }) => {
  autorun.each(
    (d) => d.items,
    (row) => {
      // 路径是 items.3.subtotal，但不会出现在提交值里（计算字段默认 virtual）
      row.subtotal.$value = round2(row.qty.$value * row.unitPrice.$value * (1 - row.discount.$value));
    },
  );

  // 表单级：读了每一行的 subtotal（计算值读计算值），依赖自动收集；
  // 改第 3 行 qty 只重跑第 3 行的 each 实例 + 下面这个 autorun，不重跑其他行
  autorun((d) => {
    const subtotal = round2(d.items.$value.reduce((s, it) => s + (it.subtotal ?? 0), 0));
    const tax = round2(subtotal * d.taxRate.$value);
    d.subtotal.$value = subtotal;
    d.tax.$value = tax;
    d.payable.$value = round2(subtotal + tax); // 应付要随报价提交：见 JSX 上的 submit
  });
  autorun((d) => {
    d.previewUrl.$value = `https://quote.example.com/${encodeURIComponent(d.slug.$value || 'draft')}`;
  });
});
// ❓ 读 d.items.$value（整个数组的快照）= 依赖整棵 items 子树：任何一行任何字段变都会重跑合计。
//    要不要按“实际读到的叶子”细化（Proxy 跟踪快照读取），还是要求写成 d.items[i].subtotal.$value 逐个读？
// ❓ “autorun 写了 $value 就是计算字段”是引擎推断的。要不要另给一个显式标记（如 Field 上的 computed 标记），
//    免得有人在 autorun 里给输入字段写默认值时把它意外变成只读？

export function QuoteForm({ initial }: { initial: Quote }) {
  const form = useForm<Quote>({ initialValues: initial, effects: [quoteEffects] });

  return (
    // onSubmit 拿到的 values 含 payable（submit），不含 subtotal / tax / previewUrl / items[].subtotal
    <Form form={form} onSubmit={(v) => api.quotes.save(v)}>
      <Field name="customer" decorator={<FormItem label="客户" />} rules={[{ required: true }]}>
        <Input />
      </Field>
      <Field name="slug" decorator={<FormItem label="短链" />} rules={[{ pattern: /^[a-z0-9-]*$/ }]}>
        <Input />
      </Field>
      {/* 计算字段的 UI 就是普通 Field：$value 由 autorun 写，自动只读，子组件当 pretty 用 */}
      <Field name="previewUrl" decorator={<FormItem label="预览" />}>
        <a className="underline" target="_blank" />
        {/* ❓ 子组件拿到 value 但 <a> 需要 href：要么 connect 一层，要么允许 render prop {(v) => <a href={v}>{v}</a>} */}
      </Field>

      <ArrayField
        name="items"
        rowKey="id"
        createRow={() => ({ id: nanoid(), sku: '', qty: 1, unitPrice: 0, discount: 0 })}
      >
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-2">
          <Field name="sku" decorator={<CellItem />} rules={[{ required: true }]}>
            <Input />
          </Field>
          <Field name="qty" decorator={<CellItem />} rules={[{ min: 1 }]}>
            <NumberInput />
          </Field>
          <Field name="unitPrice" decorator={<CellItem />} rules={[{ min: 0 }]}>
            <NumberInput />
          </Field>
          <Field name="discount" decorator={<CellItem />} rules={[{ min: 0 }, { max: 1 }]}>
            <NumberInput step={0.05} />
          </Field>
          <Field name="subtotal" decorator={<CellItem />}>
            <Money />
          </Field>
          <RemoveButton />
        </div>
      </ArrayField>

      <Field
        name="taxRate"
        decorator={<FormItem label="税率" />}
        enum={[
          { label: '0%', value: 0 },
          { label: '6%', value: 0.06 },
          { label: '13%', value: 0.13 },
        ]}
      >
        <Select />
      </Field>

      <Field name="subtotal" decorator={<FormItem label="小计" inline />}>
        <Money />
      </Field>
      <Field name="tax" decorator={<FormItem label="税额" inline />}>
        <Money />
      </Field>
      {/* 计算字段默认 virtual（不提交）；应付金额要提交 → virtual={false}（值来源与 virtual 独立） */}
      <Field name="payable" virtual={false} decorator={<FormItem label="应付" inline />}>
        <Money />
      </Field>

      <SaveButton />
    </Form>
  );
}

// 没有行时禁用提交：布局不再是字段，不能被 effect 写 pattern；直接在按钮组件里读状态
function SaveButton() {
  const empty = useFormState((f) => f.values.items.length === 0);
  return (
    <Submit asChild>
      <Button disabled={empty}>保存报价</Button>
    </Submit>
  );
}

function RemoveButton() {
  const row = useRow();
  return (
    <Button size="icon" variant="ghost" onClick={() => row.remove()}>
      ✕
    </Button>
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;
