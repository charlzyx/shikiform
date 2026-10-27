// 14 path vs UI Brand · Decorator vs Component · 一个数据字段多个 UI
// 2026-10-27 定：没有 VoidField。字段类型只按数据结构分（Field / ObjectField / ArrayField / TreeField）；
//      Card / Grid / Tabs / 工具栏都是普通布局组件，不产生 path，默认也不产生 address。
// 覆盖：同一个数据字段在“编辑区”和“侧边摘要”各有一个 UI：值 / 错误 / 校验共享（字段状态按 path），
//      visible / pattern / decorator 各自独立（UI 实例按 address）；
//      要单独控制某一个 UI，就给它起名（UI Brand）：<Field name="plan" ui="summary" /> → d.user.plan.ui('summary')；
//      这是唯一的“筛选”，按渲染顺序的 #n 已删除（2026-10-27 Q4）；没起名的 UI 只能跟着字段级状态走；
//      布局区域需要被 effect 控制时，才给它起名（<Region ui="aside"> → d.ui('aside')）。
// ⚠️ 假代码：只看 API 是否顺手，不能运行。
import { useForm, Form, Field, ObjectField, Region, defineEffects, useField } from 'shikiform';
import { Grid } from 'shikiform/pro';
import { FormItem, CellItem, Input, Select } from './_ui';
import { Card } from '@/components/ui/card';

interface Profile { user: { nickname: string; email: string; plan: 'free' | 'pro' }; compact: boolean }

const effects = defineEffects<Profile>(({ reaction }) => {
  reaction((d) => {
    const u = d.user;
    // 字段级（不带 .ui）：写的是字段状态，所有 UI 一起生效
    u.email.$required = u.plan.$value === 'pro';

    // UI 级（UI Brand）：只改起了名的那一个 UI；UI Brand handle 只有 UI 状态（$visible / $pattern / decorator、component 的 props）
    u.plan.ui('summary').$visible = u.plan.$value === 'pro'; // 侧边摘要里的 plan 只在 pro 时显示
    u.nickname.ui('summary').$pattern = 'readPretty';

    // 具名布局区域：$visible / $pattern 级联到区域内所有 UI（不改字段级状态）
    d.ui('aside').$visible = !d.compact.$value;
  });
  // ❓ 字段级 $visible、区域 $visible、UI 级 $visible 同时存在时：最终 = 三者都为 true（推荐）。
  //    $pattern 按 Q6：从字段 / 区域继承，UI 上显式设置的覆盖继承值。$required / $errors / $value 只有字段级，没有 UI 级。
  // ❓ 字符串低层写法 query('user.plan', { ui: 'summary' }) 与 d.user.plan.ui('summary') 等价；区域是否也要 query({ ui: 'aside' })？
});

export function ProfilePage() {
  const form = useForm<Profile>({
    initialValues: { user: { nickname: '', email: '', plan: 'free' }, compact: false },
    effects: [effects],
    fields: { compact: { virtual: true } },
  });

  return (
    <Form form={form}>
      <div className="grid grid-cols-[1fr_280px] gap-6">
        {/* 普通布局：Card / Grid 不进 path，也不进 address */}
        <Card>
          <ObjectField name="user">
            <Grid minColumnWidth={240}>
              {/* 主 UI：path = user.nickname，不起名 */}
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
              {/* 第二个 UI：同一个 path user.nickname，换了 Decorator（紧凑、无星号布局）、起名 ui="summary"
                  在这里输入，左边同步；左边校验报错，这里的 CellItem 也显示红框 */}
              <Field name="nickname" ui="summary" decorator={<CellItem />}>
                <Input />
              </Field>
              {/* user.plan 的第二个 UI：只读展示，起名 summary 供 effect 单独控制 */}
              <Field name="plan" ui="summary" decorator={<FormItem label="当前套餐" inline />} pattern="readPretty" />
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
  //   { ui: undefined, regions: [] },          // 主 UI，没起名
  //   { ui: 'summary', regions: ['aside'] },   // UI Brand
  // ]
  // f.value / f.errors / f.required —— 字段级，两个 UI 共享
  return <pre className="text-xs">{JSON.stringify({ path: f.path, uis: f.uis.map((u) => u.ui ?? '(主 UI)') }, null, 2)}</pre>;
}
// ❓ 具名布局怎么写：
//    A（当前）通用 <Region ui="aside"> 包任意 JSX + Pro 布局组件（Grid / QueryForm / Tabs.Pane）直接收 ui prop
//    B 只允许 Pro 布局收 ui，普通 JSX 不能被 effect 控制（要控制就用 hook 自己读状态）
//    建议 A；Region 只有 visible / pattern 两个可写属性，不是字段、没有值、不进 path。
// ❓ 区域名是否全局唯一？建议全局唯一（d.ui('aside') 挂在根上，不带 path 前缀），重复时 dev 下报错。
// ❓ 同一个字段下两个 UI 起了同一个名（两个 ui="summary"）：一起受控（当作同一个 Brand），还是 dev 报错？
