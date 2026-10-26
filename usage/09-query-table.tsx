// 09 查询表单 + 表格：调用日志
// 覆盖：Grid 自动排列（不手写 span）+ 折叠（值保留）；查询内部联动（provider → model）；
//      Computed 做 transform（空值省略 / 日期拆分）；分页（新查询回第 1 页）；
//      列筛选和查询表单是【同一个数据字段的两个 UI】（status#1 / status#2）；
//      批量选择是 Transient（不提交，新查询清空）；工具栏是 VoidField。
// ⚠️ 假代码：只看 API 是否顺手，不能运行。
import { useForm, useFieldValue, Form, Field, Transient, VoidField, Enum, defineEffects } from 'shikiform';
import { QueryForm, ProTable, useQueryTable, ProEnumPretty } from 'shikiform/pro';
import { CellItem, FormItem, Input, Select, DateRange, Checkbox } from './_ui';
import { Button } from '@/components/ui/button';
import { api } from '@/api';

// —— 枚举定义一次，查询下拉 / 列筛选 / 列展示（Pretty）都复用 ——
const StatusEnum = Enum.from([
  { label: '成功', value: 'ok', color: 'success' },
  { label: '限流', value: 'throttled', color: 'warning' },
  { label: '失败', value: 'error', color: 'error' },
]);
const ProviderEnum = Enum.from(async () => api.providers.options(), { cacheKey: () => 'all', staleTime: 60_000 });
const ModelEnum = Enum.from(async ({ provider }: { provider?: string }) => api.models.options({ provider }), {
  cacheKey: ({ provider }) => provider ?? '*',
});

interface LogQuery {
  keyword?: string;
  status?: string[];
  provider?: string;
  model?: string;
  createdAt?: [Date, Date];
  minLatency?: number;
  userId?: string;
  // —— 以下是 Transient：UI 状态 ——
  page: number;
  pageSize: number;
  selectedIds: string[];
  collapsed: boolean;
  hiddenColumns: string[];
}

const queryEffects = defineEffects<LogQuery>((e) => {
  // 查询内部联动：provider → model 的可选范围
  e.react(({ root, query }) => {
    query('model').enum = ModelEnum.with({ provider: root.provider });
  });

  // transform 是 Computed：空值省略、日期拆分、多选原样
  e.computed('params', ({ root }) =>
    omitEmpty({
      q: root.keyword?.trim(),
      status: root.status,
      provider: root.provider,
      model: root.model,
      start: root.createdAt?.[0]?.toISOString(),
      end: root.createdAt?.[1]?.toISOString(),
      minLatency: root.minLatency,
      userId: root.userId,
    }),
  );

  // 查询条件变了（不论来自查询表单还是列筛选）：回第 1 页、清空选择
  // ❓ 但查询表单是“点查询按钮才生效”，列筛选是“改了立刻生效”——同一个 status 字段两种生效时机。
  //    这里的方案：params 是“草稿参数”，useQueryTable 维护“已提交参数”；
  //    列筛选 UI 上声明 commit="immediate"，查询表单 UI 上 commit 跟随查询按钮。见下面 JSX。
  e.watch(['params'], ({ query }) => {
    query('page').value = 1;
    query('selectedIds').value = [];
  });

  // 只控制某一个 UI：列被隐藏（列设置里关掉“状态”）时，列头筛选那个 UI 一起隐藏，查询表单里那个不动
  e.react(({ root, query }) => {
    query('status#2').visible = !root.hiddenColumns?.includes('status');
    // ❓ #2 依赖“UI 出现顺序”，查询表单折叠 / 字段增删都可能让编号变。
    //    建议同时支持具名 UI：<Field name="status" ui="filter" />，query('status@filter')，#n 作为兜底。
  });
});

export function CallLogPage() {
  const form = useForm<LogQuery>({
    initialValues: { page: 1, pageSize: 20, selectedIds: [], collapsed: true, hiddenColumns: [] },
    effects: [queryEffects],
  });

  // 表格数据不是表单数据：useQueryTable 负责请求 / loading / 分页 / 竞态
  const table = useQueryTable({
    form,
    params: 'params', // 读哪个 Computed 当查询参数
    request: ({ params, page, pageSize, signal }) => api.logs.list({ ...params, page, pageSize }, { signal }),
    // page / pageSize / selection 绑定到表单里的 Transient，翻页不丢查询条件
    pagination: { page: 'page', pageSize: 'pageSize' },
  });

  return (
    <Form form={form} onSubmit={() => table.search()} onReset={() => table.search()}>
      {/* Transient 声明：没有 UI 也要声明，才能参与 submit 过滤 / reset */}
      <Transient name="page" />
      <Transient name="pageSize" />
      <Transient name="selectedIds" />
      <Transient name="hiddenColumns" />
      <Transient name="collapsed" />

      {/*
        QueryForm = VoidField + Grid：按容器宽度自动排列，minColumnWidth 决定列数；
        折叠时只显示前 visibleCount 个，操作按钮自动占最后一行剩余格子；
        折叠状态绑定 Transient "collapsed"（折叠 = visible=false，值保留）
      */}
      <QueryForm grid={{ minColumnWidth: 260, maxColumns: 4, gap: 16 }} visibleCount={3} collapsed="collapsed">
        <Field name="keyword" decorator={<FormItem label="关键词" inline />}>
          <Input placeholder="请求 id / prompt" />
        </Field>
        {/* status#1：查询表单里的多选下拉 */}
        <Field name="status" decorator={<FormItem label="状态" inline />} enum={StatusEnum}>
          <Select multiple />
        </Field>
        <Field name="provider" decorator={<FormItem label="供应商" inline />} enum={ProviderEnum}>
          <Select />
        </Field>
        <Field name="model" decorator={<FormItem label="模型" inline />}>
          <Select />
        </Field>
        {/* 占两格：Grid 自动排，个别字段可以声明 span */}
        <Field name="createdAt" decorator={<FormItem label="时间" inline />} gridSpan={2}>
          <DateRange />
        </Field>
        <Field name="minLatency" decorator={<FormItem label="最小耗时(ms)" inline />} rules={[{ min: 0 }]}>
          <Input type="number" />
        </Field>
        <Field name="userId" decorator={<FormItem label="用户" inline />}>
          <Input />
        </Field>
        {/* 查询 / 重置 / 展开 按钮：QueryForm 自带；查询表单校验错误只阻塞查询，不影响下方表格展示 */}
      </QueryForm>

      {/* 工具栏：VoidField，不进数据 */}
      <VoidField name="toolbar" className="flex justify-between">
        <BatchBar />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => table.reload()}>刷新</Button>
          <ProTable.ColumnSetting table={table} hidden="hiddenColumns" />
        </div>
      </VoidField>

      <ProTable table={table} rowKey="id" selection="selectedIds">
        <ProTable.Column title="请求 ID" dataIndex="id" width={180} />
        <ProTable.Column title="模型" dataIndex="model" />
        <ProTable.Column
          title="状态"
          dataIndex="status"
          // 展示：直接复用同一个 Enum，渲染成彩色 Tag
          render={(v) => <ProEnumPretty enum={StatusEnum} value={v} />}
          // 列头筛选：这里放的是一个 Field —— 和上面查询表单是同一个数据字段 "status"，即 status#2
          // 改它 → status 值变 → params 变 → 回第 1 页 → commit="immediate" 立即查询
          filter={
            <Field name="status" ui="filter" decorator={<CellItem />} enum={StatusEnum} commit="immediate">
              <Checkbox.Group />
            </Field>
          }
        />
        <ProTable.Column title="耗时" dataIndex="latency" sorter />
        <ProTable.Column title="时间" dataIndex="createdAt" valueType="dateTime" />
      </ProTable>
      {/* ❓ 表格行数据（结果）不是表单数据，所以 Column 用 dataIndex；而筛选是表单数据，所以用 Field。
              同一个组件里出现 dataIndex 和 Field 两种绑定方式，是否可以接受？ */}
    </Form>
  );
}

function BatchBar() {
  // 只订阅 selectedIds：选择变化只重渲染这一小块
  const selected = useFieldValue<string[]>('selectedIds');
  return (
    <div className="flex gap-2 items-center">
      <span>已选 {selected.length} 条（仅当前查询结果内；新查询会清空）</span>
      <Button disabled={selected.length === 0} onClick={() => api.logs.export(selected)}>导出</Button>
      <Button variant="destructive" disabled={selected.length === 0} onClick={() => api.logs.remove(selected)}>删除</Button>
    </div>
  );
}

const omitEmpty = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)));
