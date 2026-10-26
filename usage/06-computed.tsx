// 06 计算值（computed）：报价单
// 覆盖：行级 computed（小计，record 作用域）、表单级 computed（合计 / 税 / 应付）、预览地址。
// 2026-10-27 定：Computed 不是字段类型。“值从哪来”（输入 / 计算）和“提不提交”（submit）是两个独立属性：
//      - 值来源：在 effects 里 e.computed / row.computed 声明 → 该字段只读（pattern 固定 readPretty）、不脏检查、不校验、reset 时重算
//      - submit：computed 字段默认 submit=false；需要提交时 e.computed(name, fn, { submit: true })
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
}
interface Quote {
  customer: string;
  slug: string;
  taxRate: number;
  items: QuoteItem[];
}

// 计算值只在 effects 里声明（已定，2026-10-27）：和联动放一起，依赖自动收集，按 record 缓存
const quoteEffects = defineEffects<Quote>((e) => {
  e.each('items', (row) => {
    // 名字挂在行 record 下：路径是 items.3.subtotal，但不会出现在提交值里
    row.computed('subtotal', ({ record }) => round2(record.qty * record.unitPrice * (1 - record.discount)));
  });

  // 表单级：读了每一行的 subtotal（计算值读计算值），依赖自动收集；
  // 改第 3 行 qty 只重算第 3 行 subtotal + 下面这几个，不重算其他行
  e.computed('subtotal', ({ root }) => round2(root.items.reduce((s, it) => s + it.subtotal, 0)));
  e.computed('tax', ({ root }) => round2(root.subtotal * root.taxRate));
  // 应付金额要随报价一起提交：值来源 = 计算，submit = true（两个属性独立）
  e.computed('payable', ({ root }) => round2(root.subtotal + root.tax), { submit: true });
  e.computed('previewUrl', ({ root }) => `https://quote.example.com/${encodeURIComponent(root.slug || 'draft')}`);
});
// ❓ 类型：root.items[n].subtotal 在 Quote 类型里不存在。要么 defineEffects<Quote, { subtotal: number }>
//    额外声明计算值形状，要么 computed 返回值推导进类型（需要 builder 链式写法才推得出来）。

export function QuoteForm({ initial }: { initial: Quote }) {
  const form = useForm<Quote>({ initialValues: initial, effects: [quoteEffects] });

  return (
    // onSubmit 拿到的 values 含 payable（submit: true），不含 subtotal / tax / previewUrl / items[].subtotal
    <Form form={form} onSubmit={(v) => api.quotes.save(v)}>
      <Field name="customer" decorator={<FormItem label="客户" />} rules={[{ required: true }]}>
        <Input />
      </Field>
      <Field name="slug" decorator={<FormItem label="短链" />} rules={[{ pattern: /^[a-z0-9-]*$/ }]}>
        <Input />
      </Field>
      {/* 计算字段的 UI 就是普通 Field：因为值来源是 computed，自动只读，子组件当 pretty 用 */}
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
      <Field name="payable" decorator={<FormItem label="应付" inline />}>
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
