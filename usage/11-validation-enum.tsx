// 11 校验与枚举：活动报名后台
// 覆盖：同步规则；异步规则（防抖 + 过期作废 + 提交时等待）；跨字段（ctx.record / ctx.root）；
//      双向约束写成表单级校验（一次算两个字段的错误）；校验时机 onChange / onBlur / onSubmit；
//      warning（不阻塞提交）；同一个 Enum 复用在 Select / Radio / 表格列筛选 / ProEnumPretty；
//      懒树枚举 + CascaderPlus；外部 resolver（Zod）可选。
// ⚠️ 假代码：只看 API 是否顺手，不能运行。
import { useForm, Form, Field, ObjectField, Transient, Enum, defineEffects, defineRules, Submit } from 'shikiform';
import { ProEnumPretty, CascaderPlus, ProTable } from 'shikiform/pro';
import { zodResolver } from 'shikiform/zod';
import { z } from 'zod';
import { FormItem, CellItem, Input, Select, Radio, DateRange, NumberInput } from './_ui';
import { Button } from '@/components/ui/button';
import { api } from '@/api';

// ================= 枚举：定义一次，到处用 =================
export const LevelEnum = Enum.from([
  { label: '普通', value: 'normal', color: 'default' },
  { label: '重要', value: 'important', color: 'warning' },
  { label: '紧急', value: 'urgent', color: 'error' },
]);
// 异步：按参数缓存、并发去重、过期作废；staleTime 内不重复请求
export const VenueEnum = Enum.from(async ({ city }: { city?: string }, { signal }) => api.venues.options({ city }, { signal }), {
  cacheKey: ({ city }) => city ?? '',
  staleTime: 5 * 60_000,
});
// 懒树：选到哪层加载哪层
export const CityEnum = Enum.lazyTree(async (parent, { signal }) => api.regions.children(parent?.value ?? null, { signal }));

// ================= 可复用规则：同一条规则用于普通表单 / 表格单元格 / 查询表单 =================
export const R = defineRules({
  phone: { pattern: /^1\d{10}$/, message: '手机号格式不对' },
  // 异步规则：signal 被 abort 说明结果已过期，引擎丢弃；debounce 只针对同一字段实例
  uniqueTitle: {
    validator: async (v: string, ctx) => ((await api.events.titleExists(v, { signal: ctx.signal })) ? '活动名已存在' : null),
    debounce: 400,
    trigger: 'onBlur', // 异步规则默认只在 blur / submit 跑，打字不打接口
  },
});

interface EventForm {
  title: string;
  level: string;
  city: string[];
  venue?: string;
  capacity: number;
  vipSeats: number;
  period?: [Date, Date];
  signupDeadline?: Date;
  organizer: { name: string; phone: string; backupPhone?: string };
  agree: boolean;
}

const eventEffects = defineEffects<EventForm>((e) => {
  // 枚举参数联动：city 变 → venue 的 enum 参数变
  e.react(({ root, query }) => {
    query('venue').enum = VenueEnum.with({ city: root.city?.at(-1) });
  });

  // 双向约束：不拆成两个字段互相校验（会循环），表单级一次算两个字段
  // 返回 { path: message }，引擎写到对应字段的 errors 上（来源标记为 'form'，下次重算时只清自己写的）
  e.validate(({ root }) => {
    const errors: Record<string, string> = {};
    if (root.vipSeats > root.capacity) {
      errors.vipSeats = 'VIP 席位不能超过总容量';
      errors.capacity = '总容量小于 VIP 席位';
    }
    if (root.period && root.signupDeadline && root.signupDeadline > root.period[0]) {
      errors.signupDeadline = '报名截止必须早于活动开始';
    }
    return errors;
  });
  // ❓ e.validate 什么时候跑？建议：它读到的任一字段触发校验时（按那个字段的 trigger）+ submit。
});

export function EventCreateForm() {
  const form = useForm<EventForm>({
    initialValues: { title: '', level: 'normal', city: [], capacity: 100, vipSeats: 0, organizer: { name: '', phone: '' }, agree: false },
    effects: [eventEffects],
    validateTrigger: ['onBlur', 'onSubmit'], // 全局默认
    enumPolicy: 'error', // 枚举范围变化后旧值不合法 → 报错（本表单选“报错”，不自动清）
    // 可选：外部 schema 追加校验（结果合并进同一个字段错误树）
    resolver: zodResolver(z.object({ capacity: z.number().int().max(10_000) }).passthrough()),
  });

  return (
    <Form form={form} onSubmit={(v) => api.events.create(v)}>
      <Field name="title" decorator={<FormItem label="活动名" />} rules={[{ required: true }, { maxLength: 40 }, R.uniqueTitle]}>
        {/* FormItem 自动显示“校验中…”（validating） */}
        <Input />
      </Field>

      {/* 同一个 LevelEnum：这里用 Radio */}
      <Field name="level" decorator={<FormItem label="等级" />} enum={LevelEnum}>
        <Radio />
      </Field>

      <Field name="city" decorator={<FormItem label="城市" />} enum={CityEnum} rules={[{ required: true }]}>
        <CascaderPlus labelInValue={false} />
      </Field>
      <Field name="venue" decorator={<FormItem label="场地" />} rules={[{ required: true }]}>
        <Select />
      </Field>

      {/* onChange 触发：数字输入希望即时反馈 */}
      <Field name="capacity" decorator={<FormItem label="总容量" />} rules={[{ required: true }, { min: 1 }]} trigger="onChange">
        <NumberInput />
      </Field>
      <Field name="vipSeats" decorator={<FormItem label="VIP 席位" />} rules={[{ min: 0 }]} trigger="onChange">
        <NumberInput />
      </Field>

      <Field name="period" decorator={<FormItem label="活动时间" />} rules={[{ required: true }]}>
        <DateRange />
      </Field>
      <Field name="signupDeadline" decorator={<FormItem label="报名截止" />}>
        <Input type="date" />
      </Field>

      <ObjectField name="organizer" decorator={<FormItem label="主办方" />}>
        <Field name="name" decorator={<FormItem label="联系人" />} rules={[{ required: true }]}>
          <Input />
        </Field>
        <Field name="phone" decorator={<FormItem label="电话" />} rules={[{ required: true }, R.phone]}>
          <Input />
        </Field>
        <Field
          name="backupPhone"
          decorator={<FormItem label="备用电话" />}
          rules={[R.phone]}
          // 跨字段：ctx.record = organizer 对象；ctx.root = 整个表单
          validator={(v, ctx) => (v && v === ctx.record.phone ? '备用电话不能和主电话相同' : null)}
          // warning：显示黄色提示，不阻塞提交
          warning={(v, ctx) => (!v && ctx.root.level === 'urgent' ? '紧急活动建议填写备用电话' : null)}
        >
          <Input />
        </Field>
      </ObjectField>

      {/* Transient + 校验：同意协议是必选但不提交 */}
      <Transient name="agree" decorator={<FormItem />} rules={[{ isTrue: true, message: '请先同意活动规范' }]} trigger="onChange">
        <input type="checkbox" />
      </Transient>

      <Submit asChild>
        {/* 提交：先等 pending 的异步校验出结果，不只看同步结果 */}
        <Button>创建活动</Button>
      </Submit>
    </Form>
  );
}

// ============ 同一个 LevelEnum 在列表页：列展示 Pretty + 列筛选 Select ============
export function EventListColumns() {
  return (
    <>
      <ProTable.Column title="等级" dataIndex="level" render={(v) => <ProEnumPretty enum={LevelEnum} value={v} />} />
      <ProTable.Column
        title="等级"
        dataIndex="level"
        filter={
          <Field name="level" decorator={<CellItem />} enum={LevelEnum} commit="immediate">
            <Select multiple />
          </Field>
        }
      />
    </>
  );
}
// ❓ ProEnumPretty 在 Field 里用（pretty={<ProEnumPretty/>}）时自动拿到 field 的 enum；在表格 render 里用时要显式传 enum。
//    两种入口是否需要统一成一个？建议保留：Field 内自动、Field 外显式。
