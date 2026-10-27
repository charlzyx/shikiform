// 08 合并表格编辑：供应商 → 产品（数据保持嵌套，不拍平）
// 覆盖：表格只是嵌套数据的视图；“供应商”列是父 record 上的字段，只注册一次，rowspan 是计算值；
//      编辑合并格 = 编辑父对象一次；子行增删 / 过滤后 rowspan 自动重算；按组排序不拆组；
//      父字段错误显示在合并格、子行错误显示在行里。
// ⚠️ 假代码：只看 API 是否顺手，不能运行。
import { useForm, Form, Field, defineEffects, useRow, useArray, Submit } from 'shikiform';
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
  rowSpan?: number; // 计算字段：可见子行数
}
interface Values {
  suppliers: Supplier[];
  onlyActive: boolean; // UI 状态：表头过滤开关，virtual
}

const supplierEffects = defineEffects<Values>(({ autorun }) => {
  // 每个供应商一个实例：s 是供应商 handle，d 是根
  autorun.each(
    (d) => d.suppliers,
    (s, d) => {
      const onlyActive = d.onlyActive.$value;
      let visible = 0;
      // 子行：按 index 拿精确 handle（s.products[i]），行也是 Field，$visible 就是行显隐
      s.products.$value.forEach((p, i) => {
        const show = !onlyActive || p.active;
        s.products[i].$visible = show;
        if (show) visible++;
      });
      // rowspan = 可见子行数，计算字段，按供应商实例缓存（用局部变量，不读回刚写的 $visible）
      s.rowSpan.$value = visible;
    },
  );
  // ❓ rowSpan 应该由 MergedTable 内部自动算（读子行 $visible），用户不用写这行？我倾向：内部自动算，
  //    但这里写出来是为了说明“rowspan 就是计算值”，要能被覆盖。
  // ❓ 嵌套数组的 each：要不要允许 autorun.each 嵌套（供应商 each 里再 each 产品），
  //    还是像这里一样在外层实例里 forEach？forEach 的代价是任一产品变都重跑整个供应商实例。
});

export function SupplierProductTable({ initial }: { initial: Supplier[] }) {
  const form = useForm<Values>({ initialValues: { suppliers: initial, onlyActive: false }, effects: [supplierEffects] });

  return (
    <Form form={form} onSubmit={(v) => api.suppliers.saveAll(v.suppliers)}>
      <Field name="onlyActive" virtual decorator={<label className="flex gap-2">只看在售</label>}>
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

      <AddSupplierButton />
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
  // 组件里的 path 字符串一律是精确数据路径：supplier.path = 'suppliers.3'
  const products = useArray<Product>(`${supplier.path}.products`);
  return (
    <div className="flex flex-col gap-1">
      <Button size="sm" variant="ghost" onClick={() => supplier.moveUp()}>组上移</Button>
      <Button size="sm" variant="ghost" onClick={() => products.push({ id: nanoid(), name: '', price: 0, active: true })}>
        + 产品
      </Button>
    </div>
  );
}
function AddSupplierButton() {
  const suppliers = useArray<Supplier>('suppliers');
  return (
    <Button variant="outline" onClick={() => suppliers.push({ id: nanoid(), name: '', level: 'B', products: [] })}>
      + 供应商
    </Button>
  );
}
// ❓ 组件里拿子数组只能拼路径字符串（`${supplier.path}.products`）。要不要让 hooks 也收 draft 选择器，
//    如 useArray(d => d.suppliers[supplier.index].products)，和 effect 一个写法？
function RowActions() {
  const product = useRow<Product>();
  return (
    <Button size="icon" variant="ghost" onClick={() => product.remove()}>
      ✕
    </Button>
  );
}
