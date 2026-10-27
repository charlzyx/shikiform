// 13 跨模块联动：Agent 工具配置页（大表单拆成多个模块文件，各自维护）
// 覆盖：每个模块 = 一个 ObjectField 子树 + 自己的规则函数 + 自己的组件；
//      模块规则是普通函数，参数是模块根的 handle（Draft<模块类型>）——“相对”靠 JS 作用域，不靠相对路径字符串；
//      宿主在自己的 autorun 里把 d.model / d.tools 传进去，同一个模块在别的表单里传别的 handle 即可复用；
//      跨模块：宿主把需要的别的 handle 显式传给模块，模块不读整表单根；
//      多个模块的同名字段：列出精确 handle（没有正则 query）。
// ⚠️ 假代码：只看 API 是否顺手，不能运行。
import { useForm, Form, Field, ObjectField, ArrayField, defineEffects, useFormContext, useFormState, Submit, type Draft } from 'shikiform';
import { FormItem, Input, Select, Switch, NumberInput } from './_ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { api } from '@/api';

// ---------------- 模块 A：模型（modules/model.tsx） ----------------
interface ModelModule { provider: string; model: string; maxTokens: number; stream: boolean }
export function modelRules(m: Draft<ModelModule>) {
  m.stream.$pattern = m.provider.$value === 'ollama' ? 'disabled' : 'editable';
}
export function ModelModuleFields() {
  return (
    <>
      <Field name="provider" decorator={<FormItem label="供应商" />} enum={['openai', 'anthropic', 'ollama']}>
        <Select />
      </Field>
      <Field name="model" decorator={<FormItem label="模型" />} rules={[{ required: true }]}>
        <Input />
      </Field>
      <Field name="maxTokens" decorator={<FormItem label="Max tokens" />} rules={[{ min: 1 }]}>
        <NumberInput />
      </Field>
      <Field name="stream" decorator={<FormItem label="流式" />}>
        <Switch />
      </Field>
    </>
  );
}

// ---------------- 模块 B：工具（modules/tools.tsx） ----------------
interface Tool { name: string; enabled: boolean; timeoutMs: number }
// 每行一个工具：参数是这一行的 handle；跨模块要的东西由宿主作为 inputs 显式传进来
export function toolRules(t: Draft<Tool>, inputs: { stream: Draft<boolean> }) {
  t.timeoutMs.$visible = t.enabled.$value;
  t.timeoutMs.$required = t.enabled.$value && inputs.stream.$value === false;
}
// ❓ 跨模块输入：宿主显式传 handle（当前，模块不耦合宿主数据形状）；还是允许模块函数拿第二个参数 d（整表单根）？
export function ToolsModuleFields() {
  return (
    <ArrayField name="items" rowKey="name">
      <div className="flex gap-2">
        <Field name="name" pattern="readPretty" decorator={<FormItem />} />
        <Field name="enabled" decorator={<FormItem />}>
          <Switch />
        </Field>
        <Field name="timeoutMs" decorator={<FormItem label="超时" />} rules={[{ min: 100 }]}>
          <NumberInput />
        </Field>
      </div>
    </ArrayField>
  );
}

// ---------------- 模块 C：限额（modules/limits.tsx） ----------------
interface Limits { rpm: number; maxTokens: number }
export function LimitsModuleFields() {
  return (
    <>
      <Field name="rpm" decorator={<FormItem label="每分钟请求" />}>
        <NumberInput />
      </Field>
      <Field
        name="maxTokens"
        decorator={<FormItem label="单次 token 上限" />}
        // 跨模块校验：用绝对 path 从数据根读（不是 ../.. 爬 UI）
        validator={(v, ctx) => (v < ctx.get('model.maxTokens') ? '不能小于模型的 Max tokens' : null)}
      >
        <NumberInput />
      </Field>
    </>
  );
}

// ---------------- 宿主页面：组装模块 ----------------
interface AgentConfig { model: ModelModule; tools: { items: Tool[] }; limits: Limits }

const hostEffects = defineEffects<AgentConfig>(({ autorun }) => {
  // 把模块规则挂到具体 handle 上；同一个模块在别的页面可以传 d.fallback.model 等别的 handle
  autorun((d) => modelRules(d.model));
  autorun.each(
    (d) => d.tools.items,
    (t, d) => toolRules(t, { stream: d.model.stream }),
  );

  // 两个模块里都有 maxTokens：列出精确 handle，一次设置
  autorun((d) => {
    const locked = d.model.provider.$value === 'ollama';
    for (const h of [d.model.maxTokens, d.limits.maxTokens]) h.$pattern = locked ? 'readPretty' : 'editable';
  });
});

export function AgentConfigPage({ initial }: { initial: AgentConfig }) {
  const form = useForm<AgentConfig>({ initialValues: initial, effects: [hostEffects] });
  return (
    <Form form={form} onSubmit={(v) => api.agents.save(v)}>
      {/* UI 结构（Tabs）和数据结构无关：Tabs 不产生 path，ObjectField 才产生 */}
      <Tabs defaultValue="model">
        <TabsList>
          <TabsTrigger value="model">模型<TabErrorDot prefix="model" /></TabsTrigger>
          <TabsTrigger value="tools">工具<TabErrorDot prefix="tools" /></TabsTrigger>
          <TabsTrigger value="limits">限额<TabErrorDot prefix="limits" /></TabsTrigger>
        </TabsList>
        {/* ❓ 非激活 Tab 的内容不挂载 → 它的 Field 没挂载 → JSX 里的 rules 不生效，提交时不校验。
                提议（Q5，未定，等确认）：字段按声明（表单类型）存在，不按挂载存在；
                autorun 里写的 d.model.model.$rules = [...] 不论挂没挂载都校验；JSX 的 rules prop 只是便捷写法，只在挂载时生效。
                这里先保留 forceMount（全部挂载，CSS 隐藏）。 */}
        <TabsContent value="model" forceMount>
          <ObjectField name="model">
            <ModelModuleFields />
          </ObjectField>
        </TabsContent>
        <TabsContent value="tools" forceMount>
          <ObjectField name="tools">
            <ToolsModuleFields />
          </ObjectField>
        </TabsContent>
        <TabsContent value="limits" forceMount>
          <ObjectField name="limits">
            <LimitsModuleFields />
          </ObjectField>
        </TabsContent>
      </Tabs>
      <SummaryPanel />
      <Submit asChild>
        <Button>保存</Button>
      </Submit>
    </Form>
  );
}

// 某个模块下有没有错误：form.errors 是 { path, messages }[]，按精确 path 前缀判断（不是正则 query）
function TabErrorDot({ prefix }: { prefix: string }) {
  const n = useFormState((f) => f.errors.filter((e) => e.path === prefix || e.path.startsWith(prefix + '.')).length);
  return <span className="ml-1 text-destructive" hidden={n === 0}>•</span>;
}

// 任意深处的组件：useFormContext() 拿数据根，不需要 props 透传
function SummaryPanel() {
  const form = useFormContext<AgentConfig>();
  const enabledTools = useFormState(() => form.values.tools.items.filter((t) => t.enabled).map((t) => t.name));
  return <p className="text-sm text-muted-foreground">已启用工具：{enabledTools.join('、') || '无'}</p>;
}
