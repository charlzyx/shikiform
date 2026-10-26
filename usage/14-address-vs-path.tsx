// 14 address vs path · Decorator vs Component · 一个数据字段多个 UI
// 2026-10-27 定：没有 VoidField。字段类型只按数据结构分（Field / ObjectField / ArrayField / TreeField）；
//      Card / Grid / Tabs / 工具栏都是普通布局组件，不产生 path，默认也不产生 address。
// 覆盖：同一个数据字段在“编辑区”和“侧边摘要”各有一个 UI：值 / 错误 / 校验共享（字段状态按 path），
//      visible / pattern / decorator 各自独立（UI 实例按 address）；
//      address 只在需要时才有：#n（按渲染顺序）或 @name（具名 ui）；
//      布局区域需要被 effect 控制时，才给它起名（ui="aside" → @aside）。
// ⚠️ 假代码：只看 API 是否顺手，不能运行。
import { useForm, Form, Field, ObjectField, Region, defineEffects, useField } from 'shikiform';
import { Grid } from 'shikiform/pro';
import { FormItem, CellItem, Input, Select } from './_ui';
import { Card } from '@/components/ui/card';

interface Profile { user: { nickname: string; email: string; plan: 'free' | 'pro' }; compact: boolean }

const effects = defineEffects<Profile>((e) => {
  e.react(({ root, query }) => {
    // 字段级（无 # / @）：写的是字段状态，所有 UI 一起生效
    query('user.email').required = root.user.plan === 'pro';

    // UI 级：只改某一个 UI 实例
    query('user.plan#2').visible = root.user.plan === 'pro'; // 第 2 个渲染的 plan UI（侧边摘要）只在 pro 时显示
    query('user.nickname@summary').pattern = 'readPretty'; // 具名 UI，比 #n 稳定

    // 具名布局区域：只有起了名的布局才有 address；visible / pattern 级联到区域内所有 UI 实例（不改字段级状态）
    query('@aside').visible = !root.compact;
    // ❓ 字段级 visible 和 UI 级 visible 同时存在时：最终 = 字段 visible && 所在区域 visible && UI visible（推荐）。
    //    pattern 同理取更严格。required / errors / value 只有字段级，没有 UI 级。
  });
});

export function ProfilePage() {
  const form = useForm<Profile>({
    initialValues: { user: { nickname: '', email: '', plan: 'free' }, compact: false },
    effects: [effects],
    fields: { compact: { submit: false } },
  });

  return (
    <Form form={form}>
      <div className="grid grid-cols-[1fr_280px] gap-6">
        {/* 普通布局：Card / Grid 不进 path，也不进 address */}
        <Card>
          <ObjectField name="user">
            <Grid minColumnWidth={240}>
              {/* UI #1：path = user.nickname，address = user.nickname#1 */}
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
        </Card>

        {/* 需要被 effect 控制的布局：用 Region 起名（或给 Pro 布局组件传 ui="..."，如 <Grid ui="filter">） */}
        <Region ui="aside">
          <Card>
            <ObjectField name="user">
              {/* UI #2：同一个 path user.nickname，换了 Decorator（紧凑、无星号布局）、具名 ui="summary"
                  在这里输入，左边同步；左边校验报错，这里的 CellItem 也显示红框 */}
              <Field name="nickname" ui="summary" decorator={<CellItem />}>
                <Input />
              </Field>
              {/* user.plan 的 UI #2：只读展示 */}
              <Field name="plan" decorator={<FormItem label="当前套餐" inline />} pattern="readPretty" />
            </ObjectField>
            <DebugAddress />
          </Card>
        </Region>
      </div>
    </Form>
  );
}

// 自定义组件里读指定字段的 path 和它的所有 UI 实例
function DebugAddress() {
  const f = useField('user.nickname');
  // f.path === 'user.nickname'
  // f.uis  === [
  //   { address: 'user.nickname#1', index: 1, regions: [] },
  //   { address: 'user.nickname@summary', index: 2, name: 'summary', regions: ['aside'] },
  // ]
  // f.value / f.errors / f.required —— 字段级，两个 UI 共享
  return <pre className="text-xs">{JSON.stringify({ path: f.path, uis: f.uis.map((u) => u.address) }, null, 2)}</pre>;
}
// ❓ 具名布局怎么写：
//    A（当前）通用 <Region ui="aside"> 包任意 JSX + Pro 布局组件（Grid / QueryForm / Tabs.Pane）直接收 ui prop
//    B 只允许 Pro 布局收 ui，普通 JSX 不能被 effect 控制（要控制就用 hook 自己读状态）
//    建议 A；Region 只有 visible / pattern 两个可写属性，不是字段、没有值、不进 path。
// ❓ 区域名是否全局唯一？建议全局唯一（@aside 不带 path 前缀），重复时 dev 下报错。
