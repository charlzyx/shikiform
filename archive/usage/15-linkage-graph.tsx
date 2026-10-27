// 15 联动依赖图：一对多 / 多对一 / 多对多 + 一次事务 + 环检测
// 覆盖：A→B、C；B→C、D 这种多对多；依赖按“读了哪个 state”收集（读 value 和读 errors 是两种依赖）；
//      依赖 = reaction 里读到的 handle 状态（读 $value 和读 $errors 是两种依赖），写不算依赖；
//      一次 setValue 一个事务、按拓扑跑、每个 reaction 最多一次、只渲染一次；写入值没变不触发下一轮；
//      环：开发期直接报错，带上环路（哪个 reaction / watch 读了什么、写了什么）。
// ⚠️ 假代码：只看 API 是否顺手，不能运行。
import { useForm, Form, Field, defineEffects, useFieldValue, Submit } from 'shikiform';
import { FormItem, Input, Select, NumberInput, Switch } from './_ui';
import { Button } from '@/components/ui/button';

interface Shipping {
  country: 'CN' | 'US' | 'JP';
  express: boolean;
  weightKg: number;
  insured: boolean;
  declaredValue?: number;
  carrier?: string;
  fee?: number; // 计算字段
  errorCount?: number; // 计算字段（计算字段默认 virtual，不提交）
}

const CARRIERS: Record<Shipping['country'], string[]> = { CN: ['SF', 'JD', 'EMS'], US: ['UPS', 'FedEx'], JP: ['Yamato', 'EMS'] };

const shippingEffects = defineEffects<Shipping>(({ reaction, watch }) => {
  // 一对多：country → carrier 枚举、declaredValue 必填、express 可选
  reaction((d) => {
    d.carrier.$enum = CARRIERS[d.country.$value];
    d.declaredValue.$required = d.country.$value !== 'CN';
    d.express.$pattern = d.country.$value === 'JP' ? 'disabled' : 'editable';
  });

  // 多对一：fee 读 country / express / weightKg / insured / declaredValue —— 读到的就是依赖
  reaction((d) => {
    const base = d.country.$value === 'CN' ? 12 : 80;
    const w = Math.max(0, d.weightKg.$value - 1) * (d.express.$value ? 15 : 8);
    const ins = d.insured.$value ? (d.declaredValue.$value ?? 0) * 0.005 : 0;
    d.fee.$value = Math.round(base + w + ins);
  });

  // 多对多：fee（计算值）→ insured 的 pattern；insured → declaredValue 的 visible
  // 拓扑顺序：country → (carrier, declaredValue.$required, fee) → insured.$pattern → declaredValue.$visible
  reaction((d) => {
    d.insured.$disabled = d.fee.$value > 500; // 运费太高时强制保价
  });
  // 动作（不是推导）：fee 变了才跑，用 watch
  watch(
    (d) => d.fee,
    (d) => {
      if (d.fee.$value > 500) d.insured.$value = true;
    },
  );
  reaction((d) => {
    d.declaredValue.$visible = d.insured.$value || d.country.$value !== 'CN';
  });

  // 读 $errors 也是依赖：任何字段的 $errors 变 → errorCount 重算（只在 errors 变化时重跑，不在 value 变化时）
  // （按钮区是普通布局，不是字段，不能写 $pattern；改成一个计算值给按钮读）
  // 没有正则 query：列出要统计的精确 handle
  reaction((d) => {
    const all = [d.country, d.carrier, d.weightKg, d.express, d.insured, d.declaredValue];
    d.errorCount.$value = all.filter((h) => h.$errors.length > 0).length;
  });
  // ❓ “整表单错误数”要不要一个只读的 d.$errors（整棵子树的错误）？否则每加一个字段都要改这个列表。

  // ❌ 环（开发期报错）：如果再加一条“insured 变 → 改 weightKg”，就出现 weightKg → fee → insured → weightKg
  // watch((d) => d.insured, (d) => { d.weightKg.$value += 1 })
  // → ShikiCycleError: weightKg.$value → reaction#fee → fee.$value → watch(fee) → insured.$value → watch(insured) → weightKg.$value（10 轮未收敛）
  // ❓ 环检测是“10 轮不收敛才报”（运行时）还是“依赖图静态成环就报”（更早，但会误报：写入值相同其实收敛）？
  //    建议：运行时 10 轮 + 开发模式下打印依赖环路径。
});

export function ShippingForm() {
  const form = useForm<Shipping>({
    initialValues: { country: 'CN', express: false, weightKg: 1, insured: false },
    effects: [shippingEffects],
    devtools: true, // 开发期：控制台打印每个事务跑了哪些 reaction / watch、读 / 写了哪些 state
  });
  return (
    <Form form={form} onSubmit={console.log}>
      <Field name="country" decorator={<FormItem label="国家" />} enum={['CN', 'US', 'JP']}>
        <Select />
      </Field>
      <Field name="carrier" decorator={<FormItem label="承运商" />} rules={[{ required: true }]}>
        <Select />
      </Field>
      <Field name="weightKg" decorator={<FormItem label="重量 kg" />} rules={[{ min: 0.1 }]}>
        <NumberInput />
      </Field>
      <Field name="express" decorator={<FormItem label="加急" />}>
        <Switch />
      </Field>
      <Field name="insured" decorator={<FormItem label="保价" />}>
        <Switch />
      </Field>
      <Field name="declaredValue" decorator={<FormItem label="申报价值" />}>
        <Input />
      </Field>
      {/* fee 是计算字段（reaction 写 $value）→ 只读普通 Field */}
      <Field name="fee" decorator={<FormItem label="运费" />} />
      <Actions />
    </Form>
  );
}
function Actions() {
  const errorCount = useFieldValue<number>('errorCount');
  return (
    <div className="flex gap-2 items-center">
      <Submit asChild>
        <Button disabled={errorCount > 0}>下单</Button>
      </Submit>
      {errorCount > 0 && <span className="text-destructive text-sm">还有 {errorCount} 处错误</span>}
    </div>
  );
}
