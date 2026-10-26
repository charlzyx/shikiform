// 06 Computed：报价单
// 覆盖：行级 Computed（小计，record 作用域）、表单级 Computed（合计 / 税 / 应付）、
//      预览地址；Computed 只读、不提交、不脏检查、不校验，reset 时重算；也可以被 effect / 校验读取。
// ⚠️ 假代码：只看 API 是否顺手，不能运行。
import { useForm, Form, Field, ArrayField, Computed, VoidField, defineEffects, useRow, Submit } from 'shikiform';
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

// 声明 Computed 的地方：effects 里（和联动放一起，依赖自动收集，按 record 缓存）
// ❓ Computed 在哪声明？
//    A（当前）：effects 里 e.computed / row.computed，JSX 的 <Computed name> 只负责展示
//    B：JSX 里 <Computed name="total" value={({root}) => ...} />，展示和定义在一处
//    C：useForm({ computed: { total: fn, 'items.*.subtotal': fn } }) 配置对象
const quoteEffects = defineEffects<Quote>((e) => {
  e.each('items', (row) => {
    // 名字挂在行 record 下：路径是 items.3.subtotal，但不会出现在提交值里
    row.computed('subtotal', ({ record }) => round2(record.qty * record.unitPrice * (1 - record.discount)));
  });

  // 表单级：读了每一行的 subtotal（Computed 读 Computed），依赖自动收集；
  // 改第 3 行 qty 只重算第 3 行 subtotal + 下面这几个，不重算其他行
  e.computed('subtotal', ({ root }) => round2(root.items.reduce((s, it) => s + it.subtotal, 0)));
  e.computed('tax', ({ root }) => round2(root.subtotal * root.taxRate));
  e.computed('payable', ({ root }) => round2(root.subtotal + root.tax));
  e.computed('previewUrl', ({ root }) => `https://quote.example.com/${encodeURIComponent(root.slug || 'draft')}`);

  // Computed 也能驱动别的状态：没有行时禁用提交按钮所在的 VoidField
  e.react(({ root, query }) => {
    query('actions').pattern = root.items.length === 0 ? 'disabled' : 'editable';
  });
});
// ❓ 类型：root.items[n].subtotal 在 Quote 类型里不存在。要么 defineEffects<Quote, { subtotal: number }>
//    额外声明 Computed 形状，要么 computed 返回值推导进类型（需要 builder 链式写法才推得出来）。

export function QuoteForm({ initial }: { initial: Quote }) {
  const form = useForm<Quote>({ initialValues: initial, effects: [quoteEffects] });

  return (
    // onSubmit 拿到的 values 不含 subtotal / tax / payable / previewUrl / items[].subtotal
    // 需要的话从 form.getComputed() 拿
    <Form form={form} onSubmit={(v) => api.quotes.save({ ...v, payable: form.getComputed('payable') })}>
      <Field name="customer" decorator={<FormItem label="客户" />} rules={[{ required: true }]}>
        <Input />
      </Field>
      <Field name="slug" decorator={<FormItem label="短链" />} rules={[{ pattern: /^[a-z0-9-]*$/ }]}>
        <Input />
      </Field>
      {/* Computed 的 UI：和 Field 同样的 decorator + 子组件写法，子组件只收到 value */}
      <Computed name="previewUrl" decorator={<FormItem label="预览" />}>
        <a className="underline" target="_blank" />
        {/* ❓ 子组件拿到 value 但 <a> 需要 href：要么 connect 一层，要么允许 render prop {(v) => <a href={v}>{v}</a>} */}
      </Computed>

      <ArrayField
        name="items"
        rowKey="id"
        createRow={() => ({ id: nanoid(), sku: '', qty: 1, unitPrice: 0, discount: 0 })}
      >
        <VoidField name="row" className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-2">
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
          <Computed name="subtotal" decorator={<CellItem />}>
            <Money />
          </Computed>
          <RemoveButton />
        </VoidField>
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

      <Computed name="subtotal" decorator={<FormItem label="小计" inline />}>
        <Money />
      </Computed>
      <Computed name="tax" decorator={<FormItem label="税额" inline />}>
        <Money />
      </Computed>
      <Computed name="payable" decorator={<FormItem label="应付" inline />}>
        <Money />
      </Computed>

      <VoidField name="actions">
        <Submit asChild>
          <Button>保存报价</Button>
        </Submit>
      </VoidField>
    </Form>
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
