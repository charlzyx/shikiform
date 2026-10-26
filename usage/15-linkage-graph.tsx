// 15 联动依赖图：一对多 / 多对一 / 多对多 + 一次事务 + 环检测
// 覆盖：A→B、C；B→C、D 这种多对多；依赖按“读了哪个 state”收集（读 value 和读 errors 是两种依赖）；
//      一次 setValue 一个事务、按拓扑跑、每个 reaction 最多一次、只渲染一次；写入值没变不触发下一轮；
//      环：开发期直接报错，指出环路上的 reaction。
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
}

const CARRIERS: Record<Shipping['country'], string[]> = { CN: ['SF', 'JD', 'EMS'], US: ['UPS', 'FedEx'], JP: ['Yamato', 'EMS'] };

const shippingEffects = defineEffects<Shipping>((e) => {
  // 一对多：country → carrier 枚举、declaredValue 必填、express 可选
  e.react(({ root, query }) => {
    query('carrier').enum = CARRIERS[root.country];
    query('declaredValue').required = root.country !== 'CN';
    query('express').pattern = root.country === 'JP' ? 'disabled' : 'editable';
  });

  // 多对一：fee 读 country / express / weightKg / insured / declaredValue —— e.computed，依赖自动收集
  e.computed('fee', ({ root }) => {
    const base = root.country === 'CN' ? 12 : 80;
    const w = Math.max(0, root.weightKg - 1) * (root.express ? 15 : 8);
    const ins = root.insured ? (root.declaredValue ?? 0) * 0.005 : 0;
    return Math.round(base + w + ins);
  });

  // 多对多：fee（计算值）→ insured 的 pattern；insured → declaredValue 的 visible
  // 拓扑顺序：country → (carrier, declaredValue.required, fee) → insured.pattern → declaredValue.visible
  e.react(({ root, query }) => {
    query('insured').pattern = root.fee > 500 ? 'disabled' : 'editable'; // 运费太高时强制保价
  });
  e.watch(['fee'], ({ root, query }) => {
    if (root.fee > 500) query('insured').value = true;
  });
  e.react(({ root, query }) => {
    query('declaredValue').visible = root.insured || root.country !== 'CN';
  });

  // 读 errors 也是依赖：任一字段有错时禁用提交区（只在 errors 变化时重跑，不在 value 变化时）
  // 读“所有字段的错误”也是依赖：任何字段的 errors 变 → errorCount 重算
  // （2026-10-27 起按钮区是普通布局，不是字段，不能写 pattern；改成一个计算值给按钮读）
  e.computed('errorCount', ({ query }) => query(/.*/).filter((h) => h.errors.length > 0).length);

  // ❌ 环（开发期报错）：如果再加一条“insured 变 → 改 weightKg”，就出现 weightKg → fee → insured → weightKg
  // e.watch(['insured'], ({ query }) => { query('weightKg').value += 1 })
  // → ShikiCycleError: weightKg.value → fee → insured.value → weightKg.value（10 轮未收敛）
  // ❓ 环检测是“10 轮不收敛才报”（运行时）还是“依赖图静态成环就报”（更早，但会误报：写入值相同其实收敛）？
  //    建议：运行时 10 轮 + 开发模式下打印依赖环路径。
});

export function ShippingForm() {
  const form = useForm<Shipping>({
    initialValues: { country: 'CN', express: false, weightKg: 1, insured: false },
    effects: [shippingEffects],
    devtools: true, // 开发期：控制台打印每个事务跑了哪些 reaction、读 / 写了哪些 state
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
      {/* fee 的值来源是 computed → 只读普通 Field */}
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
