// 09 查询表单 + 表格：调用日志
// 覆盖：Grid 自动排列（不手写 span）+ 折叠（值保留）；查询内部联动（provider → model）；
//      transform 是计算字段（params 的 $value 在 autorun 里写：空值省略 / 日期拆分）；分页（watch：新查询回第 1 页）；
//      列筛选和查询表单是【同一个数据字段的两个 UI】：列筛选那个起名 ui="filter"（UI Brand），effect 里 d.status.ui('filter')；
//      结果表也是表单数据（rows），列里一律 <Field name>（相对行），只读 = $pattern 'readPretty'（2026-10-27 Q7）；
//      服务端分页：page / pageSize 是普通提交字段；选择 / 折叠 / 列设置 virtual（按场景的开关，不是字段种类）；
//      末尾有一个纯前端分页的变体：同一个 page 在那张表单里设成 virtual；工具栏是普通布局 JSX。
// ⚠️ 假代码：只看 API 是否顺手，不能运行。
import { useForm, useFieldValue, Form, Field, Enum, defineEffects } from 'shikiform';
import { QueryForm, ProTable, useQueryTable, ProEnumPretty } from 'shikiform/pro';
import { CellItem, FormItem, Input, Select, DateRange, Checkbox, DateTimePretty } from './_ui';
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

interface LogRow { id: string; model: string; status: string; latency: number; createdAt: string }

interface LogQuery {
  keyword?: string;
  status?: string[];
  provider?: string;
  model?: string;
  createdAt?: [Date, Date];
  minLatency?: number;
  userId?: string;
  // —— 计算字段：查询参数（transform 结果）——
  params?: Record<string, unknown>;
  // —— 结果行：表单数据，只读展示 ——
  rows: LogRow[];
  // —— 分页：要提交；UI 是 ProTable 自带的 Pagination ——
  page: number;
  pageSize: number;
  // —— 以下是 UI 状态：普通字段，virtual ——
  selectedIds: string[];
  collapsed: boolean;
  hiddenColumns: string[];
}

const queryEffects = defineEffects<LogQuery>(({ autorun, watch }) => {
  // 查询内部联动：provider → model 的可选范围
  autorun((d) => {
    d.model.$enum = ModelEnum.with({ provider: d.provider.$value });
  });

  // transform 是计算字段：空值省略、日期拆分、多选原样
  autorun((d) => {
    const range = d.createdAt.$value;
    d.params.$value = omitEmpty({
      q: d.keyword.$value?.trim(),
      status: d.status.$value,
      provider: d.provider.$value,
      model: d.model.$value,
      start: range?.[0]?.toISOString(),
      end: range?.[1]?.toISOString(),
      minLatency: d.minLatency.$value,
      userId: d.userId.$value,
    });
  });

  // 查询条件变了（不论来自查询表单还是列筛选）：回第 1 页、清空选择
  // ❓ 但查询表单是“点查询按钮才生效”，列筛选是“改了立刻生效”——同一个 status 字段两种生效时机。
  //    这里的方案：params 是“草稿参数”，useQueryTable 维护“已提交参数”；
  //    列筛选 UI 上声明 commit="immediate"，查询表单 UI 上 commit 跟随查询按钮。见下面 JSX。
  watch(
    (d) => d.params,
    (d) => {
      d.page.$value = 1;
      d.selectedIds.$value = [];
    },
  );

  // 结果表只读：读的东西为空 → 只跑一次（静态设置）；运行时想切成可编辑，改成读某个开关即可
  autorun((d) => {
    d.rows.$pattern = 'readPretty';
  });

  // 只控制某一个 UI（UI Brand）：列被隐藏（列设置里关掉“状态”）时，列头筛选那个 UI 一起隐藏，查询表单里那个不动
  autorun((d) => {
    d.status.ui('filter').$visible = !d.hiddenColumns.$value.includes('status');
  });
});

export function CallLogPage() {
  const form = useForm<LogQuery>({
    initialValues: { rows: [], page: 1, pageSize: 20, selectedIds: [], collapsed: true, hiddenColumns: [] },
    effects: [queryEffects],
    // 没有自己 <Field> 的状态，在这里声明字段属性（和 <Field virtual> 是同一个开关）
    // 服务端分页：page / pageSize 是普通字段（查询条件），随请求提交；它们的 UI 是 ProTable 自带的 Pagination
    // virtual 是“这张表单里”对某个字段的开关，不是字段种类（2026-10-27 定，原名 virtual，因和表单 submit 撞名改名）：
    //   virtual 字段有值，完整参与 autorun / watch（可以是依赖，也可以是计算目标），只是不进提交值。
    //   selectedIds（UI 是表格勾选列）通常 virtual；同一个 page 只在纯前端分页时才 virtual（见下面 LocalLogTable）。
    fields: {
      params: { virtual: true },
      rows: { virtual: true },
      selectedIds: { virtual: true },
      collapsed: { virtual: true },
      hiddenColumns: { virtual: true },
    },
  });

  // 表格数据不是表单数据：useQueryTable 负责请求 / loading / 分页 / 竞态
  const table = useQueryTable({
    form,
    params: 'params', // 读哪个计算字段当查询参数（精确 path）
    rows: 'rows', // 结果写回哪个字段（表格列用 <Field name> 相对行读它）
    request: ({ params, page, pageSize, signal }) => api.logs.list({ ...params, page, pageSize }, { signal }),
    // 服务端分页：page / pageSize 绑定到表单字段（普通提交字段），翻页不丢查询条件
    pagination: { mode: 'server', page: 'page', pageSize: 'pageSize' },
  });

  return (
    <Form form={form} onSubmit={() => table.search()} onReset={() => table.search()}>
      {/*
        QueryForm = 布局组件（Grid + 折叠 + 按钮），不是字段、不产生 path / address：按容器宽度自动排列，minColumnWidth 决定列数；
        折叠时只显示前 visibleCount 个，操作按钮自动占最后一行剩余格子；
        折叠状态绑定字段 "collapsed"（virtual）（折叠 = 被折叠字段 visible=false，值保留）
      */}
      <QueryForm grid={{ minColumnWidth: 260, maxColumns: 4, gap: 16 }} visibleCount={3} collapsed="collapsed">
        <Field name="keyword" decorator={<FormItem label="关键词" inline />}>
          <Input placeholder="请求 id / prompt" />
        </Field>
        {/* 查询表单里的 status：主 UI，不起名 */}
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

      {/* 工具栏：普通 JSX 布局，不进数据 */}
      <div className="flex justify-between">
        <BatchBar />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => table.reload()}>刷新</Button>
          <ProTable.ColumnSetting table={table} hidden="hiddenColumns" />
        </div>
      </div>

      {/* 结果表：name="rows"，列里全是 <Field name>（相对行），和可编辑表同一种写法；只读来自 d.rows.$pattern */}
      <ProTable table={table} name="rows" rowKey="id" selection="selectedIds">
        <ProTable.Column title="请求 ID" width={180}>
          <Field name="id" decorator={<CellItem />} />
        </ProTable.Column>
        <ProTable.Column title="模型">
          <Field name="model" decorator={<CellItem />} />
        </ProTable.Column>
        <ProTable.Column
          title="状态"
          // 列头筛选：这里放的是查询条件 status（根上的字段），和上面查询表单是同一个数据字段，UI Brand = filter
          // 改它 → status 值变 → params 变 → 回第 1 页 → commit="immediate" 立即查询
          filter={
            <Field name="status" ui="filter" decorator={<CellItem />} enum={StatusEnum} commit="immediate">
              <Checkbox.Group />
            </Field>
          }
        >
          {/* 单元格：行里的 status，readPretty 时用同一个 Enum 渲染成彩色 Tag */}
          <Field name="status" decorator={<CellItem />} enum={StatusEnum} pretty={<ProEnumPretty />} />
        </ProTable.Column>
        <ProTable.Column title="耗时" sortKey="latency">
          <Field name="latency" decorator={<CellItem />} />
        </ProTable.Column>
        <ProTable.Column title="时间">
          <Field name="createdAt" decorator={<CellItem />} pretty={<DateTimePretty />} />
        </ProTable.Column>
      </ProTable>
      {/* ❓ 同一个 Column 里：单元格 <Field name="status"> 相对行（rows.N.status），filter 里的 <Field name="status"> 却是根上的查询条件。
              filter 插槽里的 name 按根解析，是否可以接受？还是要求 filter 显式写成另一个字段名（如 statusFilter）？ */}
    </Form>
  );
}

// ---------------- 变体：纯前端分页（一次拉全量，本地翻页） ----------------
// 同一个 page 字段，这个场景里不是查询条件：不提交，但仍然可响应、可联动 → 这张表单里把它设成 virtual
interface LocalLogs { keyword?: string; rows: LogRow[]; page: number; pageSize: number; selectedIds: string[] }

const localEffects = defineEffects<LocalLogs>(({ watch }) => {
  // 联动照常：关键词变了回第 1 页（page 是 virtual 也一样能读写）
  watch(
    (d) => d.keyword,
    (d) => {
      d.page.$value = 1;
    },
  );
});

export function LocalLogTable({ all }: { all: LogRow[] }) {
  const form = useForm<LocalLogs>({
    initialValues: { rows: all, page: 1, pageSize: 20, selectedIds: [] },
    effects: [localEffects],
    fields: {
      rows: { virtual: true },
      page: { virtual: true }, // 前端分页：page 不提交
      pageSize: { virtual: true },
      selectedIds: { virtual: true },
    },
  });
  return (
    <Form form={form}>
      <Field name="keyword" decorator={<FormItem label="关键词" inline />}>
        <Input />
      </Field>
      {/* pagination="client"：ProTable 自己按 page / pageSize 切片 rows，Pagination UI 绑同一个 page 字段 */}
      <ProTable name="rows" rowKey="id" selection="selectedIds" pagination={{ mode: 'client', page: 'page', pageSize: 'pageSize' }}>
        <ProTable.Column title="请求 ID">
          <Field name="id" decorator={<CellItem />} pattern="readPretty" />
        </ProTable.Column>
        <ProTable.Column title="模型">
          <Field name="model" decorator={<CellItem />} pattern="readPretty" />
        </ProTable.Column>
      </ProTable>
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
