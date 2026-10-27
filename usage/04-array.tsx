// 04 数组：多 Provider 路由（主备 + 权重）
// 覆盖：ArrayField 增 / 删 / 上下移 / 复制；模板里的 rules 与联动对每一行生效；
//      数组级校验（名称唯一、至少一个启用）；稳定 rowKey（排序不 remount、不丢焦点）。
// ⚠️ 假代码：只看 API 是否顺手，不能运行。
import { useForm, Form, Field, ArrayField, Enum, defineEffects, useRow, useArray, Submit } from 'shikiform';
import { FormItem, Input, Select, Switch, NumberInput } from './_ui';
import { Button } from '@/components/ui/button';
import { nanoid } from 'nanoid';
import { api } from '@/api';

interface Route {
  id: string; // 稳定 key，不提交也行，这里业务要提交
  name: string;
  type: 'openai' | 'anthropic' | 'ollama';
  apiKey?: string;
  baseUrl?: string;
  enabled: boolean;
  weight: number;
}
interface RoutingConfig {
  routes: Route[];
  strategy: 'failover' | 'weighted';
}

const TypeEnum = Enum.from([
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'Ollama', value: 'ollama' },
]);

const routingEffects = defineEffects<RoutingConfig>(({ autorun }) => {
  // 模板联动：写一次，每一行（含新增、复制、移动后的行）各自一个实例；row 就是“当前行”，不写相对路径字符串
  autorun.each(
    (d) => d.routes,
    (row, d) => {
      const t = row.type.$value;
      row.apiKey.$visible = t !== 'ollama';
      row.apiKey.$required = t !== 'ollama';
      row.baseUrl.$required = t === 'ollama';
      // 未启用的行整行只读：行 handle 本身也有 $pattern，向下级联
      row.$pattern = row.enabled.$value ? 'editable' : 'readPretty';
      // 全局 → 每一行：故障转移模式下不需要权重（读根 d，不用正则一次命中所有行）
      row.weight.$visible = d.strategy.$value === 'weighted';
    },
  );
  // ❓ 一个 each 实例同时读本行和根（d.strategy）：strategy 一变，所有行实例都重跑——符合预期，但 2000 行时要不要拆成
  //    单独的 autorun 去写每一行（那就要在 autorun 里 forEach 所有行，等于一次写 N 个目标）？
});

export function RoutingForm({ initial }: { initial: RoutingConfig }) {
  const form = useForm<RoutingConfig>({ initialValues: initial, effects: [routingEffects] });

  return (
    <Form form={form} onSubmit={(v) => api.routing.save(v)}>
      <Field
        name="strategy"
        decorator={<FormItem label="策略" />}
        enum={[
          { label: '主备（按顺序故障转移）', value: 'failover' },
          { label: '按权重', value: 'weighted' },
        ]}
      >
        <Select />
      </Field>

      <ArrayField
        name="routes"
        rowKey="id"
        // 新增 / 复制时如何生成一行；复制时 id 必须重新生成
        createRow={() => ({ id: nanoid(), name: '', type: 'openai', enabled: true, weight: 1 })}
        copyRow={(row) => ({ ...row, id: nanoid(), name: `${row.name}-副本` })}
        // 数组级规则：ctx.value 是整个数组
        rules={[{ minLength: 1, message: '至少一条路由' }]}
        validator={(routes) => (routes.some((r) => r.enabled) ? null : '至少启用一条路由')}
        decorator={<FormItem label="路由" />}
      >
        {/* 子节点是“行模板”：每行渲染一次，name 都是相对当前行 record 的 */}
        <div className="grid grid-cols-[1fr_140px_1fr_80px_80px_auto] gap-2 items-start">
          <Field
            name="name"
            decorator={<FormItem />}
            rules={[{ required: true }]}
            // 跨行校验：ctx.array 是最近一级数组，ctx.index 是当前行
            validator={(v, ctx) =>
              ctx.array.some((r, i) => i !== ctx.index && r.name === v) ? '名称重复' : null
            }
          >
            <Input placeholder="名称" />
          </Field>
          <Field name="type" decorator={<FormItem />} enum={TypeEnum}>
            <Select />
          </Field>
          <Field name="apiKey" decorator={<FormItem />}>
            <Input type="password" placeholder="API Key" />
          </Field>
          <Field name="weight" decorator={<FormItem />} rules={[{ min: 0 }, { max: 100 }]}>
            <NumberInput />
          </Field>
          <Field name="enabled" decorator={<FormItem />}>
            <Switch />
          </Field>
          <RowActions />
        </div>
      </ArrayField>

      <AddRouteButton />
      <Submit asChild>
        <Button>保存</Button>
      </Submit>
    </Form>
  );
}

// 行操作：useRow() 拿到当前行的操作，不需要传 index
function RowActions() {
  const row = useRow<Route>();
  return (
    <div className="flex gap-1">
      <Button size="icon" variant="ghost" disabled={row.isFirst} onClick={() => row.moveUp()}>↑</Button>
      <Button size="icon" variant="ghost" disabled={row.isLast} onClick={() => row.moveDown()}>↓</Button>
      <Button size="icon" variant="ghost" onClick={() => row.copy()}>⧉</Button>
      <Button size="icon" variant="ghost" onClick={() => row.remove()}>✕</Button>
    </div>
  );
}

// ArrayField 外部也能操作：useArray(path)（path 是精确数据路径）
function AddRouteButton() {
  const routes = useArray<Route>('routes');
  return (
    <Button variant="outline" onClick={() => routes.push()}>
      + 添加路由（当前 {routes.length} 条）
    </Button>
  );
}
// ❓ ArrayField 的子节点直接当“行模板”（当前写法），还是要求 <ArrayField.Items> 包一层？
//    直接当模板最短，但 ArrayField 内想放“添加”按钮 / 表头就得放到外面或另开 slot。
