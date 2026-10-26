// 14 address vs path · Decorator vs Component · 一个数据字段多个 UI
// 覆盖：VoidField（Card / Grid / Tabs）只产生 address 不产生 path；
//      同一个数据字段在“编辑区”和“侧边摘要”各有一个 UI：值 / 错误 / 校验共享（字段状态树按 path），
//      visible / pattern / decorator 各自独立（UI 树按 address）；#n 与具名 ui 的区别。
// ⚠️ 假代码：只看 API 是否顺手，不能运行。
import { useForm, Form, Field, ObjectField, VoidField, defineEffects, useField } from 'shikiform';
import { Grid } from 'shikiform/pro';
import { FormItem, CellItem, Input, Select, TextPretty } from './_ui';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

interface Profile { user: { nickname: string; email: string; plan: 'free' | 'pro' } }

const effects = defineEffects<Profile>((e) => {
  e.react(({ root, query }) => {
    // 字段级（无 #）：写的是字段状态，所有 UI 一起生效
    query('user.email').required = root.user.plan === 'pro';

    // UI 级（#n / @name）：只改某一个 UI 实例
    query('user.plan#2').visible = root.user.plan === 'pro'; // 侧边摘要里只在 pro 时显示套餐
    query('user.nickname@summary').pattern = 'readPretty'; // 具名 UI，比 #n 稳定
    // ❓ 字段级 visible 和 UI 级 visible 同时存在时：最终 = 字段 visible && UI visible（推荐）。
    //    pattern 同理取更严格。required / errors / value 只有字段级，没有 UI 级。
  });
});

export function ProfilePage() {
  const form = useForm<Profile>({ initialValues: { user: { nickname: '', email: '', plan: 'free' } }, effects: [effects] });

  return (
    <Form form={form}>
      <div className="grid grid-cols-[1fr_280px] gap-6">
        {/* VoidField：address = main，path 不变 */}
        <VoidField name="main" component={<Card />}>
          <ObjectField name="user">
            {/* Grid 也是 VoidField：address = main.user.grid，Field 的 path 仍然是 user.nickname */}
            <Grid minColumnWidth={240}>
              {/* UI #1：address = main.user.grid.nickname，path = user.nickname */}
              <Field name="nickname" decorator={<FormItem label="昵称" />} rules={[{ required: true }]}>
                <Input />
              </Field>
              <Field name="email" decorator={<FormItem label="邮箱" />}>
                <Input />
              </Field>
              <Field name="plan" decorator={<FormItem label="套餐" />} enum={['free', 'pro']}>
                <Select />
              </Field>
            </Grid>
          </ObjectField>
        </VoidField>

        <VoidField name="aside" component={<Card />}>
          <ObjectField name="user">
            {/* UI #2：同一个 path user.nickname，换了 Decorator（紧凑、无星号布局）、具名 ui="summary"
                在这里输入，左边同步；左边校验报错，这里的 CellItem 也显示红框 */}
            <Field name="nickname" ui="summary" decorator={<CellItem />}>
              <Input />
            </Field>
            {/* UI #2 of user.plan：只读展示 */}
            <Field name="plan" decorator={<FormItem label="当前套餐" inline />} pattern="readPretty" />
          </ObjectField>
          <DebugAddress />
        </VoidField>
      </div>
    </Form>
  );
}

// 自定义组件里读当前字段 / 指定字段的 address、path、uis
function DebugAddress() {
  const f = useField('user.nickname');
  // f.path    === 'user.nickname'
  // f.uis     === [{ index: 1, address: 'main.user.grid.nickname' }, { index: 2, name: 'summary', address: 'aside.user.nickname' }]
  // f.value / f.errors / f.required —— 字段级，两个 UI 共享
  return <pre className="text-xs">{JSON.stringify({ path: f.path, uis: f.uis.map((u) => u.address) }, null, 2)}</pre>;
}
// ❓ VoidField 用 component={<Card/>} 包一层，还是直接 <Card> 当普通 JSX？
//    普通 JSX（不用 VoidField）也能工作，只是没有 address 段、不能被 query 控制显隐。
//    建议：只有需要被 effect 控制（显隐 / pattern 级联）时才用 VoidField，其余直接写 JSX。
