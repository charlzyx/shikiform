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

// 集中 effect：一处读源，一处写多个目标（2026-10-27 定：draft 路径代理 + reaction / watch）
const providerEffects = defineEffects<ProviderConfig>(({ reaction, watch }) => {
  // 相对性 = JS 变量：p 就是 'provider' 这个 handle，不写相对路径字符串
  reaction((d) => {
    const p = d.provider;
    const t = p.type.$value; // 读了 type.$value → 只在 type 变化时重跑；下面的赋值都不是依赖
    p.apiKey.$visible = t !== 'ollama';
    p.apiKey.$required = t !== 'ollama' && t !== 'custom';
    p.baseUrl.$visible = t === 'azure' || t === 'ollama' || t === 'custom';
    p.baseUrl.$required = t === 'azure' || t === 'custom';
    p.deployment.$visible = t === 'azure';
    // 枚举参数：只给参数，加载 / 缓存 / 竞态由 Enum 管（读了 baseUrl.$value，所以 baseUrl 变也重跑）
    p.model.$enum = ModelEnum.with({ type: t, baseUrl: p.baseUrl.$value });
    // 只读展示：ollama 不需要鉴权
    p.authMode.$pattern = t === 'ollama' ? 'readPretty' : 'editable';
  });
  // ❓ 这一个 reaction 写了 7 个目标，任何一个目标被别处的 reaction 也写会冲突——冲突时报错还是后写赢？

  // “type 变化时做一次动作”是命令式的：用 watch（显式源），不用 reaction（自动收集）
  // 回调里读 type.$value 不会成为依赖：watch 只认第一个参数给出的源
  watch(
    (d) => d.provider.type,
    (d) => {
      d.provider.model.$value = undefined; // 换供应商，旧模型一律清掉
      d.provider.authMode.$value = d.provider.type.$value === 'ollama' ? 'none' : 'bearer';
    },
  );

  // 全局一对多：直接从根 d 读
  reaction((d) => {
    // o 系列模型不支持 temperature
    d.temperature.$disabled = /^o\d/.test(d.provider.model.$value ?? '');
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
