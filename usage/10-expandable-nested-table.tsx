// 10 行展开二级表格 + 编辑：订单 → 订单行（Array<Object<Array<Object>>>）
// 覆盖：一级表每行可展开，展开区里是二级表（该订单的 items）；展开状态是 submit=false 的普通字段 expandedKeys（按 rowKey 记，每行独立）；
//      表格级“查看 / 编辑”模式：pattern 切换，查看态自动用 Pretty（不写三元）；
//      行级草稿：编辑中的改动先进草稿，保存才提交（一次事务），取消回滚；
//      二级表的 record / array 全是相对的，没有 orders.3.items.2.price 这种绝对路径。
// ⚠️ 假代码：只看 API 是否顺手，不能运行。
import { useForm, Form, Field, Enum, defineEffects, useRow, useFieldValue } from 'shikiform';
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

interface Item { id: string; sku: string; qty: number; price: number }
interface Order { id: string; no: string; customer: string; status: string; items: Item[] }
interface Values { orders: Order[]; editMode: boolean; expandedKeys: string[] }

const orderEffects = defineEffects<Values>((e) => {
  // 表格级模式：一处切换，整棵 orders 子树的 pattern 跟着变（pattern 向下级联）
  e.react(({ root, query }) => {
    query('orders').pattern = root.editMode ? 'editable' : 'readPretty';
  });

  e.each('orders', (order) => {
    // 已发货 / 已取消的订单即使在编辑模式也只读（子级 pattern 覆盖父级）
    order.react(({ record, query }) => {
      if (record.status === 'shipped' || record.status === 'cancelled') query('.').pattern = 'readPretty';
    });
    // ❓ “父级 editable、子级 readPretty”的覆盖规则：子级显式写过就以子级为准？还是取更严格的那个？
    //    建议：取更严格的（disabled > readPretty > editable），否则父级切 readPretty 时子级 editable 会漏出来。

    order.computed('amount', ({ record }) => record.items.reduce((s, it) => s + it.qty * it.price, 0));

    // 二级表：record = 订单行 item，parent = 订单
    order.each('items', (item) => {
      item.computed('lineTotal', ({ record }) => record.qty * record.price);
    });
  });
});

export function OrderTable({ initial }: { initial: Order[] }) {
  const form = useForm<Values>({
    initialValues: { orders: initial, editMode: false, expandedKeys: [] },
    effects: [orderEffects],
    // UI 状态和“确认密码”是同一个开关：submit=false（2026-10-27 起没有 Transient 类型）
    fields: { expandedKeys: { submit: false } },
  });

  return (
    <Form form={form}>
      <Field name="editMode" submit={false} decorator={<label className="flex gap-2">编辑模式</label>}>
        <Switch />
      </Field>

      <ArrayTable
        name="orders"
        rowKey="id"
        // 展开状态绑定到字段 expandedKeys（submit=false），按 rowKey 记：排序 / 翻页后不串行
        // ❓ 不绑定时 ArrayTable 内部自管展开状态（不进表单）——要不要允许？建议允许，绑定是可选的受控模式。
        expandable={{ render: <OrderItems />, expandedKeys: 'expandedKeys' }}
        // 行级草稿：编辑中的改动只进草稿层，不触发全局 reaction；save 时整行校验 + 一次事务提交
        // ❓ 草稿方案二选一：
        //    A（当前）draft="row"：改动写在草稿层（草稿也是 submit=false 的状态），取消直接丢弃；计算值 / effect 在草稿内另算一份（行内预览要对）
        //    B：直接改正式值 + 编辑开始时快照，取消时回滚；简单，但编辑中就会触发全局联动和其他行的计算值
        draft="row"
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
          {/* ❓ pretty 作为 Field prop（当前）vs 由组件自己处理 readPretty（connect 时声明 pretty 组件）？
                  建议都支持：connect(Select, { pretty: ProEnumPretty }) 作默认，Field 的 pretty prop 覆盖。 */}
        </ArrayTable.Column>
        <ArrayTable.Column title="金额" width={120}>
          {/* amount 由 order.computed 声明 → 只读普通 Field */}
          <Field name="amount" decorator={<CellItem />}>
            <Money />
          </Field>
        </ArrayTable.Column>
        <ArrayTable.Column title="" width={160}>
          <RowEditActions />
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

function RowEditActions() {
  const row = useRow<Order>();
  const editMode = useFieldValue<boolean>('/editMode'); // ❓ '/' 前缀表示从根开始？还是要求 useFieldValue 默认就从根解析？
  // 行级编辑：row.draft 只在 draft="row" 时存在
  return (
    <div className="flex gap-1" hidden={!editMode}>
      <Button size="sm" variant="ghost" disabled={row.draft.editing} onClick={() => row.draft.start()}>编辑</Button>
      {/* save：只校验这一行（含二级表），通过后一次事务写回；失败时错误留在这一行，不阻塞其他行 */}
      <Button size="sm" disabled={!row.draft.editing} onClick={() => row.draft.save().then(() => api.orders.update(row.value))}>
        保存
      </Button>
      <Button size="sm" variant="ghost" disabled={!row.draft.editing} onClick={() => row.draft.cancel()}>取消</Button>
    </div>
  );
}
// 别扭点：上面用了 hidden={!editMode} 控制显隐——这其实就是 JSX 里的显隐逻辑（虽然不是三元）。
// 2026-10-27 起布局不是字段，按钮组本来就不能被 effect 写 visible —— 所以这里用 hook 读状态是唯一写法，也合理。
// 规则因此收窄为：Field 的显隐必须进 effect；纯展示 / 布局组件用 hook 读状态自己决定。
