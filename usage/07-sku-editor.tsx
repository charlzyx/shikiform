// 07 SKU 选择器（首屏）：多对多联动 = 数据，不是 if/else
// 覆盖：每个维度是 Field，它的可选范围（enum）由一张 SKU 表算出来；任意顺序选；
//      选完后不合法的旧选择在【一个】集中 effect 里清掉；最终 SKU / 价格 / 库存是 Computed。
//      维度从 3 个变 5 个，下面的代码一行不改。
// ⚠️ 假代码：只看 API 是否顺手，不能运行。
import { useForm, Form, Field, Computed, defineEffects, Submit } from 'shikiform';
import { comboOptions, comboMatch } from 'shikiform'; // core 里的通用“组合联动”工具，没有任何 SKU 业务
import { FormItem, Radio, Money } from './_ui';
import { Button } from '@/components/ui/button';
import { cart } from '@/api';

// —— 业务数据：一张合法组合表（来自后端）——
interface SkuRow {
  skuId: string;
  color: string;
  storage: string;
  edition: string;
  price: number;
  stock: number;
}
const SKUS: SkuRow[] = [
  { skuId: 'B-128-STD', color: '黑色', storage: '128G', edition: '标准版', price: 999, stock: 12 },
  { skuId: 'B-256-PRO', color: '黑色', storage: '256G', edition: 'Pro', price: 1499, stock: 3 },
  { skuId: 'W-256-PRO', color: '白色', storage: '256G', edition: 'Pro', price: 1499, stock: 8 },
  { skuId: 'W-128-STD', color: '白色', storage: '128G', edition: '标准版', price: 999, stock: 0 }, // 缺货
  { skuId: 'R-512-MAX', color: '红色', storage: '512G', edition: 'Max', price: 1999, stock: 5 },
];
const DIMS = ['color', 'storage', 'edition'] as const;
type Dim = (typeof DIMS)[number];
type Selection = Partial<Record<Dim, string>> & { qty: number };

const skuEffects = defineEffects<Selection>((e) => {
  // (1) 可选范围：多对多。color 的 enum 读 storage + edition，storage 的 enum 读 color + edition……
  //     依赖图自动收集，按拓扑一次事务算完，没有 per-field 级联。
  e.react(({ root, query }) => {
    for (const dim of DIMS) {
      // comboOptions：在“其他维度当前选择都匹配”的行里取 dim 的 distinct 值；
      // 全部都缺货的值标 disabled（缺货置灰，PLAN §11 先这样）
      query(dim).enum = comboOptions(SKUS, root, dim, { disabledWhen: (rows) => rows.every((r) => r.stock === 0) });
    }
  });

  // (2) 非法选择清理：唯一一处。用户刚改的那个维度保留，其他与之冲突的清掉。
  //     ❓ 这里没用 enumPolicy:'clear' 自动清，是因为“保留刚改的那个”需要 lastChanged —— 自动策略做不到。
  //        结论候选：enumPolicy 只给 'error' | 'none'，“清”永远显式写在 effect 里，避免两处各清一半。
  e.watch(DIMS, ({ root, query, changed }) => {
    for (const dim of DIMS) {
      if (dim === changed.name) continue;
      const v = root[dim];
      if (v && !comboMatch(SKUS, { ...root, [dim]: v })) query(dim).value = undefined;
    }
  });

  // (3) 多对一：最终结果全是 Computed
  e.computed('matched', ({ root }) => SKUS.filter((r) => DIMS.every((d) => !root[d] || r[d] === root[d])));
  e.computed('sku', ({ root }) => (root.matched.length === 1 ? root.matched[0] : null));
  e.computed('priceText', ({ root }) => {
    const ps = root.matched.map((r) => r.price);
    return ps.length === 0 ? '—' : Math.min(...ps) === Math.max(...ps) ? `¥${ps[0]}` : `¥${Math.min(...ps)} ~ ¥${Math.max(...ps)}`;
  });
  e.computed('stock', ({ root }) => root.sku?.stock ?? null);

  // qty 上限跟库存走
  e.react(({ root, query }) => {
    query('qty').pattern = root.sku ? 'editable' : 'disabled';
    query('qty').rules = [{ min: 1 }, { max: root.stock ?? 1, message: `库存仅剩 ${root.stock}` }];
  });
  // ❓ 在 effect 里改 rules（动态规则） vs 在 JSX 里写 validator 读 ctx.root.stock：两种都能表达，推荐哪种？
});

export function SkuPicker() {
  const form = useForm<Selection>({ initialValues: { qty: 1 }, effects: [skuEffects] });

  return (
    <Form form={form} onSubmit={(v) => cart.add({ skuId: form.getComputed('sku')!.skuId, qty: v.qty })}>
      {/* 三个维度长得一模一样：enum 全由 effect 给，JSX 没有任何逻辑 */}
      <Field name="color" decorator={<FormItem label="颜色" />} rules={[{ required: true }]}>
        <Radio />
      </Field>
      <Field name="storage" decorator={<FormItem label="容量" />} rules={[{ required: true }]}>
        <Radio />
      </Field>
      <Field name="edition" decorator={<FormItem label="版本" />} rules={[{ required: true }]}>
        <Radio />
      </Field>

      <Computed name="priceText" decorator={<FormItem label="价格" />} />
      <Computed name="stock" decorator={<FormItem label="库存" />} />
      <Field name="qty" decorator={<FormItem label="数量" />}>
        <Radio /* 实际是 Stepper，省略 */ />
      </Field>

      <Submit asChild>
        <Button>加入购物车</Button>
      </Submit>
    </Form>
  );
}
// 同一套 SKUS + skuEffects 可以原样用在 08 的“SKU 表格编辑器”里——数据一份，选择器 / 编辑器两种 UI。
