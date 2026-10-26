// 13 跨模块联动：Agent 工具配置页（大表单拆成多个模块文件，各自维护）
// 覆盖：每个模块 = 一个 ObjectField 子树 + 自己的 effects + 自己的组件；模块内只用相对 record；
//      跨模块：沿【数据根】走（useFormContext / ctx.root / 绝对 path），不沿 UI 父链；
//      正则 query 一次命中多个模块的同名字段；模块可以在别的表单里原样复用（挂到不同 path 下）。
// ⚠️ 假代码：只看 API 是否顺手，不能运行。
import { useForm, Form, Field, ObjectField, ArrayField, VoidField, defineEffects, useFormContext, useFormState, Submit } from 'shikiform';
import { FormItem, Input, Select, Switch, NumberInput } from './_ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { api } from '@/api';

// ---------------- 模块 A：模型（modules/model.tsx） ----------------
interface ModelModule { provider: string; model: string; maxTokens: number; stream: boolean }
export const modelEffects = defineEffects<ModelModule>((e) => {
  e.react(({ record, query }) => {
    query('./stream').pattern = record.provider === 'ollama' ? 'disabled' : 'editable';
  });
});
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
export const toolsEffects = defineEffects<{ items: Tool[] }>((e) => {
  e.each('items', (t) => {
    t.react(({ record, query, root }) => {
      // 跨模块读：root 是【数据根】，不是“上一层 UI”；模块不知道自己被挂在 tabs / 卡片 / 弹窗里
      // ❓ 模块内的 root 是整个表单的根（当前），还是“模块根”？跨模块就必须是整表单根；
      //    但这样模块就耦合了宿主的数据形状（root.model.provider）。备选：模块声明 inputs，由宿主注入。
      query('./timeoutMs').visible = record.enabled;
      query('./timeoutMs').required = record.enabled && root.model.stream === false;
    });
  });
});
export function ToolsModuleFields() {
  return (
    <ArrayField name="items" rowKey="name">
      <VoidField name="row" className="flex gap-2">
        <Field name="name" pattern="readPretty" decorator={<FormItem />} />
        <Field name="enabled" decorator={<FormItem />}>
          <Switch />
        </Field>
        <Field name="timeoutMs" decorator={<FormItem label="超时" />} rules={[{ min: 100 }]}>
          <NumberInput />
        </Field>
      </VoidField>
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

const hostEffects = defineEffects<AgentConfig>((e) => {
  // 把模块 effect 挂到具体 path 上；同一个模块在别的页面可以挂到 'fallback.model' 等别的 path
  e.scope('model', modelEffects);
  e.scope('tools', toolsEffects);

  // 正则：两个模块里都有 maxTokens（model.maxTokens、limits.maxTokens），一次命中
  e.react(({ root, query }) => {
    const locked = root.model.provider === 'ollama';
    query(/\.maxTokens$/).forEach((h) => (h.pattern = locked ? 'readPretty' : 'editable'));
  });
});

export function AgentConfigPage({ initial }: { initial: AgentConfig }) {
  const form = useForm<AgentConfig>({ initialValues: initial, effects: [hostEffects] });
  return (
    <Form form={form} onSubmit={(v) => api.agents.save(v)}>
      {/* UI 结构（Tabs）和数据结构无关：Tabs 不产生 path，ObjectField 才产生 */}
      <Tabs defaultValue="model">
        <TabsList>
          <TabsTrigger value="model">模型<TabErrorDot pattern={/^model\./} /></TabsTrigger>
          <TabsTrigger value="tools">工具<TabErrorDot pattern={/^tools\./} /></TabsTrigger>
          <TabsTrigger value="limits">限额<TabErrorDot pattern={/^limits\./} /></TabsTrigger>
        </TabsList>
        {/* ❓ 非激活 Tab 的内容不挂载 → 它的 Field 没注册 → JSX 里的 rules 不存在，提交时不校验！
                这是“规则写在 JSX”最大的坑。选项：
                A：Tabs 用 forceMount（全部挂载，CSS 隐藏）——简单，但大表单首屏重
                B：Field 注册与挂载分离：<Form> 首次渲染做一次“注册遍历”
                C：规则也可写进 effects（e.rules('model.model', [...])），JSX 规则只是语法糖
                建议 A 作默认 + C 兜底。 */}
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

// 正则 + 字段状态：某个模块下有没有错误
function TabErrorDot({ pattern }: { pattern: RegExp }) {
  const n = useFormState((f) => f.query(pattern).filter((h) => h.errors.length > 0).length);
  return <span className="ml-1 text-destructive" hidden={n === 0}>•</span>;
}

// 任意深处的组件：useFormContext() 拿数据根，不需要 props 透传
function SummaryPanel() {
  const form = useFormContext<AgentConfig>();
  const enabledTools = useFormState(() => form.values.tools.items.filter((t) => t.enabled).map((t) => t.name));
  return <p className="text-sm text-muted-foreground">已启用工具：{enabledTools.join('、') || '无'}</p>;
}
