// 10 行展开二级表格 + 编辑：订单 → 订单行（Array<Object<Array<Object>>>）
// 覆盖：一级表每行可展开，展开区里是二级表（该订单的 items）；展开状态是 virtual 的普通字段 expandedKeys（按 rowKey 记，每行独立）；
//      表格级“查看 / 编辑”模式：$pattern 切换，向下继承，查看态自动用 Pretty（不写三元）；
//      子级显式设置的 $pattern 覆盖继承值（2026-10-27 Q6，跟 Formily）；
//      二级表的字段名全是相对行的，effect 里用 row handle，没有 orders.3.items.2.price 这种手写路径。
//      行级草稿（编辑中先进草稿、保存才提交）：Q8 延后，v1 不做；本页直接编辑正式值。
// ⚠️ 假代码：只看 API 是否顺手，不能运行。
import { useForm, Form, Field, Enum, defineEffects } from 'shikiform';
import { ArrayTable, ProEnumPretty } from 'shikiform/pro';
import { CellItem, Input, NumberInput, Select, Switch, Money, TextPretty } from './_ui';
import { Button } from '@/components/ui/button';
import { nanoid } from 'nanoid';
import { api } from '@/api';

const OrderStatusEnum = Enum.from([
  { label: '待付款', value: 'pending', color: 'warning' },
  { label: '已付款', value: 'paid', color: 'processing' },
  { label: '已发货', value: 'shipped', color: 'success' },
  { label: '已取消', value: 'cancelled', color: 'default' },
]);

interface Item { id: string; sku: string; qty: number; price: number; lineTotal?: number /* 计算字段 */ }
interface Order { id: string; no: string; customer: string; status: string; items: Item[]; amount?: number /* 计算字段 */ }
interface Values { orders: Order[]; editMode: boolean; expandedKeys: string[] }

const orderEffects = defineEffects<Values>(({ reaction }) => {
  // 表格级模式：一处切换，整棵 orders 子树继承这个 $pattern
  reaction((d) => {
    d.orders.$pattern = d.editMode.$value ? 'editable' : 'readPretty';
  });

  reaction.each(
    (d) => d.orders,
    (order) => {
      // 已发货 / 已取消的订单即使在编辑模式也只读：子级显式设置覆盖继承值（Q6 已定）
      const locked = order.status.$value === 'shipped' || order.status.$value === 'cancelled';
      order.$pattern = locked ? 'readPretty' : undefined; // undefined = 不显式设置，跟随父级
      // ❓ “取消显式设置、恢复继承”是写 undefined（当前），还是另给一个 'inherit' 值？

      // 二级表：按 index 拿精确 handle，行内小计 + 订单金额（计算字段）
      let amount = 0;
      order.items.$value.forEach((it, i) => {
        const line = it.qty * it.price;
        order.items[i].lineTotal.$value = line;
        amount += line;
      });
      order.amount.$value = amount;
    },
  );
});

export function OrderTable({ initial }: { initial: Order[] }) {
  const form = useForm<Values>({
    initialValues: { orders: initial, editMode: false, expandedKeys: [] },
    effects: [orderEffects],
    // UI 状态和“确认密码”是同一个开关：virtual（2026-10-27 起没有 Transient 类型）
    fields: { expandedKeys: { virtual: true } },
  });

  return (
    <Form form={form}>
      <Field name="editMode" virtual decorator={<label className="flex gap-2">编辑模式</label>}>
        <Switch />
      </Field>

      <ArrayTable
        name="orders"
        rowKey="id"
        // 展开状态绑定到字段 expandedKeys（virtual），按 rowKey 记：排序 / 翻页后不串行
        // ❓ 不绑定时 ArrayTable 内部自管展开状态（不进表单）——要不要允许？建议允许，绑定是可选的受控模式。
        expandable={{ render: <OrderItems />, expandedKeys: 'expandedKeys' }}
        // 行级草稿（draft="row"、row.draft.save / cancel）：Q8 延后，v1 不做
      >
        <ArrayTable.Column title="订单号" width={160}>
          <Field name="no" decorator={<CellItem />} pattern="readPretty" />
        </ArrayTable.Column>
        <ArrayTable.Column title="客户">
          <Field name="customer" decorator={<CellItem />} rules={[{ required: true }]}>
            <Input />
          </Field>
        </ArrayTable.Column>
        <ArrayTable.Column title="状态" width={140}>
          {/* 编辑态 Select，查看态自动换成 pretty：不写 editMode ? <Select/> : <Tag/> */}
          <Field name="status" decorator={<CellItem />} enum={OrderStatusEnum} pretty={<ProEnumPretty />}>
            <Select />
          </Field>
          {/* readPretty 时用 Field 的 pretty 组件展示（没给 pretty 时用默认 TextPretty） */}
        </ArrayTable.Column>
        <ArrayTable.Column title="金额" width={120}>
          {/* amount 是计算字段（reaction 写 $value）→ 只读普通 Field */}
          <Field name="amount" decorator={<CellItem />}>
            <Money />
          </Field>
        </ArrayTable.Column>
      </ArrayTable>
    </Form>
  );
}

// 展开区：就是另一个 ArrayTable，name 相对当前订单 record
function OrderItems() {
  return (
    <ArrayTable name="items" rowKey="id" createRow={() => ({ id: nanoid(), sku: '', qty: 1, price: 0 })} size="small">
      <ArrayTable.Column title="SKU">
        <Field name="sku" decorator={<CellItem />} rules={[{ required: true }]}>
          <Input />
        </Field>
      </ArrayTable.Column>
      <ArrayTable.Column title="数量" width={100}>
        <Field
          name="qty"
          decorator={<CellItem />}
          rules={[{ min: 1 }]}
          // ctx.parent = 订单 record：待付款订单单行数量 ≤ 99（演示跨层读取）
          validator={(v, ctx) => (ctx.parent.status === 'pending' && v > 99 ? '待付款订单单行 ≤ 99' : null)}
        >
          <NumberInput />
        </Field>
      </ArrayTable.Column>
      <ArrayTable.Column title="单价" width={120}>
        <Field name="price" decorator={<CellItem />} pretty={<Money />}>
          <NumberInput />
        </Field>
      </ArrayTable.Column>
      <ArrayTable.Column title="小计" width={120}>
        <Field name="lineTotal" decorator={<CellItem />}>
          <Money />
        </Field>
      </ArrayTable.Column>
      <ArrayTable.Addition>+ 添加一行</ArrayTable.Addition>
    </ArrayTable>
  );
}
