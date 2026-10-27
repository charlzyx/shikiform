// 16 effects 参考：reaction / reaction.each / watch + draft 路径代理（2026-10-27 定稿的写法）
// 一页看完整套联动语法；其他用例都按这一页写。
//
// 规则速记：
//   1. 没有点号开头的相对路径字符串（当前级 / 上一级）。相对性 = JS 作用域：根 draft 叫 d，行迭代里是回调参数 row。
//   2. d.apiKey、d.address.city、d.items[0].price 都是“字段 handle”：代理只拼路径，不创建真实中间对象，
//      所以解构、存变量、传给函数都安全。
//   3. 字段状态一律 $ 前缀（$value / $visible / $required / $disabled / $pattern / $enum / $rules / $errors …），
//      不带 $ 的属性都是子字段 —— 数据里叫 value / visible 的字段也不会撞名。
//   4. 只有两个入口：
//        reaction(d => …)                     自动收集：读 $xxx 就是依赖，赋值不是依赖；必须同步；
//                                             每次运行 = 一次 Immer produce / 一个事务；成环报错并给出环路。
//                                             派生状态和计算值都用它（计算值 = 只读 Field，$value 在 reaction 里写）。
//        reaction.each(d => d.items, (row, d) => …)   每行（树：每个节点）一个实例。
//        watch(d => d.params, d => …)        显式源：只在源变化时跑；写“动作”（回第 1 页、清掉下级值）。
//      when 是保留字，不对外暴露。
//   5. 定位数据永远用精确 path；行 / 树节点先找 index / pos（findIndex、findPos → pathOf），不按条件过滤。
//      唯一的“过滤”是 UI Brand：同一个 path 渲染了多个 UI 时，JSX 里 ui="summary" 起名，
//      effect 里 d.discount.ui('summary').$visible = …（UI Brand 只有 UI 状态：$visible / $pattern / decorator / component props）。
//      具名布局区域：d.ui('aside').$visible = …
// ⚠️ 假代码：只看 API 是否顺手，不能运行。
import { useForm, Form, Field, ObjectField, ArrayField, Region, Enum, defineEffects, Submit } from 'shikiform';
import { FormItem, CellItem, Input, Select, NumberInput, Checkbox, Money } from './_ui';
import { Button } from '@/components/ui/button';
import { api } from '@/api';

interface Item { id: string; name: string; price: number; qty: number; total?: number; gift: boolean }
interface Order {
  type: 'openai' | 'ollama' | 'custom';
  apiKey?: string;
  baseUrl?: string;
  address: { province?: string; city?: string; street: string };
  items: Item[];
  discount: number;
  params: { keyword?: string; status?: string }; // 查询参数（virtual）
  page: number; // 分页（要提交）
}

const CityEnum = Enum.from(async ({ province }: { province?: string }) => api.regions.cities(province), {
  cacheKey: ({ province }) => province ?? '',
});

const orderEffects = defineEffects<Order>(({ reaction, watch }) => {
  // —— 一对多：type → apiKey / baseUrl 显隐 ——
  reaction((d) => {
    const t = d.type.$value; // 读 = 依赖：只在 type 变时重跑
    d.apiKey.$visible = t !== 'ollama'; // 写 ≠ 依赖
    d.apiKey.$required = t !== 'ollama';
    d.baseUrl.$visible = t !== 'openai';
  });

  // —— ObjectField：相对性就是 JS 变量 ——
  reaction((d) => {
    const a = d.address; // 存一个 handle 是安全的，它只是路径 'address'
    a.city.$disabled = !a.province.$value;
    a.city.$enum = CityEnum.with({ province: a.province.$value });
  });

  // —— 每行：计算值 + 行内联动（row 就是“当前行”，不写相对路径字符串） ——
  reaction.each(
    (d) => d.items,
    (row) => {
      const total = row.price.$value * row.qty.$value;
      row.total.$value = total; // 计算值：total 是只读 Field，值在这里写
      row.gift.$disabled = total < 100; // 满 100 才能选赠品（用局部变量，不在同一个 run 里读回刚写的 total）
    },
  );

  // —— 定位某一行：先 findIndex，再按精确 path 取 handle（不按条件过滤） ——
  reaction((d) => {
    const i = d.items.$value.findIndex((it) => it.id === 'shipping-fee');
    if (i >= 0) d.items[i].qty.$disabled = true; // 运费行数量不可改
  });

  // —— UI Brand：discount 渲染了两次，只控制“摘要”那一个 UI ——
  reaction((d) => {
    d.discount.ui('summary').$visible = d.discount.$value > 0;
    d.ui('aside').$visible = d.items.$value.length > 0; // 具名布局区域
  });

  // —— watch：显式源，写动作 ——
  watch(
    (d) => d.params, // 查询参数变了（任一子字段）
    (d) => {
      d.page.$value = 1; // 回第 1 页
    },
  );
  watch(
    (d) => d.address.province, // 省变了
    (d) => {
      d.address.city.$value = undefined; // 清掉下级的市
    },
  );
});
// ❓ 同一个 run 里先写后读（row.total.$value = …; 再读 row.total.$value）算不算依赖？算的话就是自依赖（环），
//    不算的话要区分“本 run 写过的 state”。上面用局部变量 total 规避。
// ❓ d.ui('aside') / d.discount.ui('summary') 的 ui 不带 $：如果数据里正好有叫 ui 的子字段就撞名。要不要改成 $ui(...)？

export function OrderForm() {
  const form = useForm<Order>({
    initialValues: { type: 'openai', address: { street: '' }, items: [], discount: 0, params: {}, page: 1 },
    effects: [orderEffects],
    fields: { params: { virtual: true } }, // page 要提交；params 只是中间值
    // virtual 的字段照样参与 reaction / watch（params 在上面既是 watch 的源，也是计算目标）
  });

  return (
    <Form form={form} onSubmit={(v) => api.orders.create(v)}>
      <Field name="type" decorator={<FormItem label="类型" />} enum={['openai', 'ollama', 'custom']}>
        <Select />
      </Field>
      <Field name="apiKey" decorator={<FormItem label="API Key" />}>
        <Input type="password" />
      </Field>
      <Field name="baseUrl" decorator={<FormItem label="Base URL" />}>
        <Input />
      </Field>

      <ObjectField name="address" decorator={<FormItem label="地址" />}>
        <Field name="province" decorator={<FormItem label="省" />} enum={['浙江', '广东']}>
          <Select />
        </Field>
        <Field name="city" decorator={<FormItem label="市" />}>
          <Select />
        </Field>
        <Field name="street" decorator={<FormItem label="街道" />}>
          <Input />
        </Field>
      </ObjectField>

      <ArrayField name="items" rowKey="id">
        <div className="grid grid-cols-5 gap-2">
          <Field name="name" decorator={<CellItem />}><Input /></Field>
          <Field name="price" decorator={<CellItem />}><NumberInput /></Field>
          <Field name="qty" decorator={<CellItem />}><NumberInput /></Field>
          {/* total 的 $value 由 reaction 写 → 只读 Field */}
          <Field name="total" decorator={<CellItem />}><Money /></Field>
          <Field name="gift" decorator={<CellItem />}><Checkbox /></Field>
        </div>
      </ArrayField>

      {/* 同一个 path discount 两个 UI：主 UI 不起名；摘要 UI 起名 summary（UI Brand） */}
      <Field name="discount" decorator={<FormItem label="折扣" />}>
        <NumberInput />
      </Field>
      <Region ui="aside">
        <Field name="discount" ui="summary" decorator={<FormItem label="已优惠" inline />} pattern="readPretty" />
      </Region>

      <Submit asChild>
        <Button>提交</Button>
      </Submit>
    </Form>
  );
}
