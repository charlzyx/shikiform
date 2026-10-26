// 02 Provider 配置：一对多联动
// provider.type 一变：apiKey 显隐、baseUrl 必填、model 的枚举范围、authMode 默认值 —— 全在一个集中 effect 里写。
// JSX 只写结构，没有任何三元显隐。
// ⚠️ 假代码：只看 API 是否顺手，不能运行。
import { useForm, Form, Field, ObjectField, Enum, defineEffects, Submit } from 'shikiform';
import { FormItem, Input, Select, Radio, NumberInput } from './_ui';
import { Button } from '@/components/ui/button';
import { api } from '@/api';

type ProviderType = 'openai' | 'anthropic' | 'azure' | 'ollama' | 'custom';

interface ProviderConfig {
  provider: {
    type: ProviderType;
    apiKey?: string;
    baseUrl?: string;
    authMode: 'bearer' | 'header' | 'none';
    model?: string;
    deployment?: string; // 只有 azure 用
  };
  temperature: number;
}

// 静态枚举
const ProviderTypeEnum = Enum.from([
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'Azure OpenAI', value: 'azure' },
  { label: 'Ollama（本地）', value: 'ollama' },
  { label: '自定义兼容接口', value: 'custom' },
]);

// 异步枚举：参数变了才请求，按参数缓存，过期请求作废
const ModelEnum = Enum.from(
  async ({ type, baseUrl }: { type: ProviderType; baseUrl?: string }, { signal }) =>
    (await api.models.list({ type, baseUrl }, { signal })).map((m) => ({ label: m.name, value: m.id })),
  { cacheKey: ({ type, baseUrl }) => `${type}|${baseUrl ?? ''}`, debounce: 300 },
);

// 集中 effect：一处读源，一处写多个目标
// ❓ 写法 A（当前）：handle 赋值  query('x').visible = ...
//    写法 B：链式 setter         field('x').visible(...)
//    写法 C：typed proxy         $.provider.apiKey.$visible = ...
const providerEffects = defineEffects<ProviderConfig>((e) => {
  // e.scope：进入 provider 这个 record，内部 query 一律相对 record
  e.scope('provider', (p) => {
    // p.record 是响应式读：读了 type，就只在 type 变化时重跑
    // ❓ 这一个 react 里写了 5 个目标，任何一个目标被别处写也会冲突——冲突时报错还是后写赢？
    p.react(({ record, query }) => {
      const t = record.type;
      query('./apiKey').visible = t !== 'ollama';
      query('./apiKey').required = t !== 'ollama' && t !== 'custom';
      query('./baseUrl').visible = t === 'azure' || t === 'ollama' || t === 'custom';
      query('./baseUrl').required = t === 'azure' || t === 'custom';
      query('./deployment').visible = t === 'azure';
      // 枚举参数：只给参数，加载 / 缓存 / 竞态由 Enum 管
      query('./model').enum = ModelEnum.with({ type: t, baseUrl: record.baseUrl });
      // 只读展示：ollama 不需要鉴权
      query('./authMode').pattern = t === 'ollama' ? 'readPretty' : 'editable';
    });

    // “当 type 变化时做一次动作”是命令式的，不是派生：用 watch（显式依赖），不用 react（自动收集）
    // ❓ react（自动依赖、派生状态）+ watch（显式依赖、副作用）两个原语，会不会让人分不清？
    p.watch(['./type'], ({ record, query }) => {
      query('./model').value = undefined; // 换供应商，旧模型一律清掉
      query('./authMode').value = record.type === 'ollama' ? 'none' : 'bearer';
    });
  });

  // 全局一对多：root 作用域
  e.react(({ root, query }) => {
    // o 系列模型不支持 temperature
    query('temperature').pattern = /^o\d/.test(root.provider.model ?? '') ? 'disabled' : 'editable';
  });
});

export function ProviderConfigForm({ initial }: { initial: ProviderConfig }) {
  const form = useForm<ProviderConfig>({
    initialValues: initial,
    effects: [providerEffects],
    // 枚举过滤后旧值不合法时的统一策略（全表单只能选一种）：'clear' 清掉 / 'error' 报校验错误
    enumPolicy: 'clear',
  });

  return (
    <Form form={form} onSubmit={(v) => api.settings.saveProvider(v)}>
      <ObjectField name="provider">
        <Field name="type" decorator={<FormItem label="供应商" />} enum={ProviderTypeEnum}>
          <Select />
        </Field>
        {/* required 由 effect 写；Decorator 自动显示星号 */}
        <Field name="apiKey" decorator={<FormItem label="API Key" />}>
          <Input type="password" autoComplete="off" />
        </Field>
        <Field name="baseUrl" decorator={<FormItem label="Base URL" />} rules={[{ format: 'url' }]}>
          <Input placeholder="https://" />
        </Field>
        <Field name="deployment" decorator={<FormItem label="Deployment" />}>
          <Input />
        </Field>
        <Field
          name="authMode"
          decorator={<FormItem label="鉴权方式" />}
          enum={[
            { label: 'Bearer', value: 'bearer' },
            { label: '自定义 Header', value: 'header' },
            { label: '无', value: 'none' },
          ]}
        >
          <Radio />
        </Field>
        {/* enum 是异步的：Field 自动把 loading 传给组件（options + loading） */}
        <Field name="model" decorator={<FormItem label="模型" />} rules={[{ required: true }]}>
          <Select placeholder="先选供应商" />
        </Field>
      </ObjectField>

      <Field name="temperature" decorator={<FormItem label="Temperature" />} rules={[{ min: 0 }, { max: 2 }]}>
        <NumberInput step={0.1} />
      </Field>

      <Submit asChild>
        <Button>保存</Button>
      </Submit>
    </Form>
  );
}
