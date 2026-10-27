// 07 SKU 选择器（首屏）：多对多联动 = 数据，不是 if/else
// 覆盖：每个维度是 Field，它的可选范围（enum）由一张 SKU 表算出来；任意顺序选；
//      选完后不合法的旧选择由 watch 清掉（每个维度一个 watch，谁触发谁就是“刚改的”）；
//      最终 SKU / 价格 / 库存是计算字段（$value 在 reaction 里写，只读、不提交）。
//      维度从 3 个变 5 个，下面的代码一行不改。
// ⚠️ 假代码：只看 API 是否顺手，不能运行。
import { useForm, Form, Field, defineEffects, Submit } from 'shikiform';
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
type Selection = Partial<Record<Dim, string>> & {
  qty: number;
  // —— 计算字段（reaction 写 $value，默认不提交）——
  sku?: SkuRow | null;
  priceText?: string;
  stock?: number | null;
};

const skuEffects = defineEffects<Selection>(({ reaction, watch }) => {
  // (1) 可选范围：多对多。color 的 $enum 读 storage + edition，storage 的 $enum 读 color + edition……
  //     依赖图自动收集，按拓扑一次事务算完，没有 per-field 级联。
  reaction((d) => {
    const sel = Object.fromEntries(DIMS.map((dim) => [dim, d[dim].$value]));
    for (const dim of DIMS) {
      // comboOptions：在“其他维度当前选择都匹配”的行里取 dim 的 distinct 值；
      // 全部都缺货的值标 disabled（缺货置灰，PLAN §11 先这样）
      d[dim].$enum = comboOptions(SKUS, sel, dim, { disabledWhen: (rows) => rows.every((r) => r.stock === 0) });
    }
  });

  // (2) 非法选择清理：每个维度一个 watch。触发的那个维度就是“刚改的”，保留它，清掉与之冲突的其他维度。
  //     不需要 changed.name：显式源本身就说明了是谁变了。
  //     ❓ 这里没用 enumPolicy:'clear' 自动清，是因为“保留刚改的那个”自动策略做不到。
  //        结论候选：enumPolicy 只给 'error' | 'none'，“清”永远显式写在 watch 里，避免两处各清一半。
  for (const changed of DIMS) {
    watch(
      (d) => d[changed],
      (d) => {
        const keep = d[changed].$value;
        for (const dim of DIMS) {
          if (dim === changed) continue;
          const v = d[dim].$value;
          // 和刚改的维度凑不出任何合法组合 → 清掉
          if (v && !comboMatch(SKUS, { [changed]: keep, [dim]: v })) d[dim].$value = undefined;
        }
      },
    );
  }
  // ❓ watch 多个源：要不要支持 watch(d => [d.color, d.storage, d.edition], (d, changed) => …)？
  //    当前写法是循环注册，每个源一个 watch，不需要额外的 changed 参数。

  // (3) 多对一：最终结果全是计算字段（matched 只是局部变量，不是字段）
  reaction((d) => {
    const matched = SKUS.filter((r) => DIMS.every((k) => !d[k].$value || r[k] === d[k].$value));
    const sku = matched.length === 1 ? matched[0] : null;
    const ps = matched.map((r) => r.price);
    d.sku.$value = sku;
    d.priceText.$value =
      ps.length === 0 ? '—' : Math.min(...ps) === Math.max(...ps) ? `¥${ps[0]}` : `¥${Math.min(...ps)} ~ ¥${Math.max(...ps)}`;
    d.stock.$value = sku?.stock ?? null;

    // qty 上限跟库存走（同一个 run 里用局部变量 sku，不读回刚写的 d.sku.$value）
    d.qty.$disabled = !sku;
    d.qty.$rules = [{ min: 1 }, { max: sku?.stock ?? 1, message: `库存仅剩 ${sku?.stock ?? 0}` }];
  });
  // ❓ 在 effect 里改 $rules（动态规则） vs 在 JSX 里写 validator 读 ctx.root.stock：两种都能表达，推荐哪种？
});

export function SkuPicker() {
  const form = useForm<Selection>({ initialValues: { qty: 1 }, effects: [skuEffects] });

  return (
    <Form form={form} onSubmit={(v) => cart.add({ skuId: form.getValue('sku')!.skuId, qty: v.qty })}>
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

      {/* priceText / stock 是计算字段（reaction 写 $value）→ 只读普通 Field，无子组件时用默认 TextPretty */}
      <Field name="priceText" decorator={<FormItem label="价格" />} />
      <Field name="stock" decorator={<FormItem label="库存" />} />
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
