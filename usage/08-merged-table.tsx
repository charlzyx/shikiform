// 08 合并表格编辑：供应商 → 产品（数据保持嵌套，不拍平）
// 覆盖：表格只是嵌套数据的视图；“供应商”列是父 record 上的字段，只注册一次，rowspan 是计算值；
//      编辑合并格 = 编辑父对象一次；子行增删 / 过滤后 rowspan 自动重算；按组排序不拆组；
//      父字段错误显示在合并格、子行错误显示在行里。
// ⚠️ 假代码：只看 API 是否顺手，不能运行。
import { useForm, Form, Field, defineEffects, useRow, Submit } from 'shikiform';
import { MergedTable } from 'shikiform/pro';
import { CellItem, Input, NumberInput, Switch, Select, TextPretty } from './_ui';
import { Button } from '@/components/ui/button';
import { nanoid } from 'nanoid';
import { api } from '@/api';

interface Product {
  id: string;
  name: string;
  price: number;
  active: boolean;
}
interface Supplier {
  id: string;
  name: string;
  level: 'A' | 'B' | 'C';
  products: Product[];
}
interface Values {
  suppliers: Supplier[];
  onlyActive: boolean; // UI 状态：表头过滤开关，submit={false}
}

const supplierEffects = defineEffects<Values>((e) => {
  e.each('suppliers', (s) => {
    // 子行可见性：过滤开关 → 每个产品行的 visible（行也是 Field，ObjectField 的 visible 就是行显隐）
    s.each('products', (p) => {
      p.react(({ record, root, query }) => {
        query('.').visible = !root.onlyActive || record.active;
      });
    });
    // rowspan = 可见子行数，计算值，按 supplier record 缓存
    // ❓ 应该由 MergedTable 内部自动算（读子行 visible），用户不用写这行？我倾向：内部自动算，
    //    但这里写出来是为了说明“rowspan 就是计算值”，要能被覆盖。
    s.computed('rowSpan', ({ record, query }) => record.products.filter((_, i) => query(`./products.${i}`).visible).length);
  });
});

export function SupplierProductTable({ initial }: { initial: Supplier[] }) {
  const form = useForm<Values>({ initialValues: { suppliers: initial, onlyActive: false }, effects: [supplierEffects] });

  return (
    <Form form={form} onSubmit={(v) => api.suppliers.saveAll(v.suppliers)}>
      <Field name="onlyActive" submit={false} decorator={<label className="flex gap-2">只看在售</label>}>
        <Switch />
      </Field>

      {/*
        MergedTable：外层数组 = 分组（suppliers），内层数组 = 行（products）
        <MergedTable.Group> 里的列绑定到供应商 record，渲染成合并格（rowSpan 读计算值）
        <MergedTable.Column> 里的列绑定到产品 record
      */}
      <MergedTable name="suppliers" rowKey="id" rows="products" rowRowKey="id" rowSpan="rowSpan">
        <MergedTable.Group title="供应商" width={200}>
          {/* 这是 suppliers.N.name：整组只有这一个 Field，编辑一次所有行都“更新” */}
          <Field name="name" decorator={<CellItem />} rules={[{ required: true }]}
            // 父字段错误显示在合并格
            validator={(v, ctx) => (ctx.array.some((s, i) => i !== ctx.index && s.name === v) ? '供应商重名' : null)}
          >
            <Input />
          </Field>
        </MergedTable.Group>
        <MergedTable.Group title="等级" width={80}>
          <Field name="level" decorator={<CellItem />} enum={['A', 'B', 'C']}>
            <Select />
          </Field>
        </MergedTable.Group>
        <MergedTable.Group title="" width={60}>
          <GroupActions />
        </MergedTable.Group>

        {/* 行列：name 相对产品 record */}
        <MergedTable.Column title="产品" >
          <Field name="name" decorator={<CellItem />} rules={[{ required: true }]}>
            <Input />
          </Field>
        </MergedTable.Column>
        <MergedTable.Column title="价格" width={120}>
          <Field
            name="price"
            decorator={<CellItem />}
            // 跨层：ctx.parent 是上一层 record（供应商）；C 级供应商的产品不能超过 1000
            validator={(v, ctx) => (ctx.parent.level === 'C' && v > 1000 ? 'C 级供应商单价 ≤ 1000' : null)}
            // ❓ ctx.parent 指“上一层 record（跳过数组）”还是“上一层节点（数组本身）”？建议跳过数组，数组用 ctx.array。
          >
            <NumberInput />
          </Field>
        </MergedTable.Column>
        <MergedTable.Column title="在售" width={80}>
          <Field name="active" decorator={<CellItem />}>
            <Switch />
          </Field>
        </MergedTable.Column>
        <MergedTable.Column title="" width={60}>
          <RowActions />
        </MergedTable.Column>
      </MergedTable>

      <Button variant="outline" onClick={() => form.query('suppliers').push({ id: nanoid(), name: '', level: 'B', products: [] })}>
        + 供应商
      </Button>
      <Submit asChild>
        <Button>保存</Button>
      </Submit>
    </Form>
  );
}

// 合并格里的操作作用于“组”：useRow() 在 Group 列里拿到的是供应商行，在普通列里拿到的是产品行
// ❓ 同一个 useRow() 在不同列返回不同层级的行，会不会让人困惑？备选：useRow('suppliers') 显式指定层级。
function GroupActions() {
  const supplier = useRow<Supplier>();
  return (
    <div className="flex flex-col gap-1">
      <Button size="sm" variant="ghost" onClick={() => supplier.moveUp()}>组上移</Button>
      <Button size="sm" variant="ghost" onClick={() => supplier.query('./products').push({ id: nanoid(), name: '', price: 0, active: true })}>
        + 产品
      </Button>
    </div>
  );
}
function RowActions() {
  const product = useRow<Product>();
  return (
    <Button size="icon" variant="ghost" onClick={() => product.remove()}>
      ✕
    </Button>
  );
}
