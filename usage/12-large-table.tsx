// 12 超大表格：2000 行价格批量调整
// 覆盖：行虚拟化（只挂可视区）；字段级订阅（改一格只重渲染该格 + 真正依赖它的计算值）；
//      commit="blur"：打字只改本地草稿，不进全局 reaction，blur / 回车才提交一次；
//      按 record 缓存计算值；rowKey 稳定，排序不 remount 不丢焦点；渲染计数用于验收。
// ⚠️ 假代码：只看 API 是否顺手，不能运行。
import { useForm, Form, Field, defineEffects, useFormState, useFormContext } from 'shikiform';
import { ArrayTable, RenderCounter } from 'shikiform/pro';
import { CellItem, NumberInput, Input, Money } from './_ui';
import { Button } from '@/components/ui/button';
import { api } from '@/api';

interface PriceRow { id: string; sku: string; cost: number; markup: number; price: number }
interface Values { rows: PriceRow[]; globalMarkup: number }

const priceEffects = defineEffects<Values>((e) => {
  e.each('rows', (row) => {
    // 按 record 缓存：只有这一行的 cost / markup 变了才重算
    row.computed('suggested', ({ record }) => Math.ceil(record.cost * (1 + record.markup)));
    row.computed('belowCost', ({ record }) => record.price < record.cost);
  });
  // 全表聚合：任意一行 price 提交后重算一次（不是每次按键）
  e.computed('belowCostCount', ({ root }) => root.rows.filter((r) => r.belowCost).length);
});

export function BulkPriceEditor({ rows }: { rows: PriceRow[] }) {
  const form = useForm<Values>({
    initialValues: { rows, globalMarkup: 0.3 },
    effects: [priceEffects],
    // 全表单默认：文本 / 数字输入都在 blur / Enter 时才 commit 到 store（大表推荐）
    // ❓ commit 默认值：普通表单 'change'（每次按键进 store）更符合直觉；大表 'blur'。
    //    放在 useForm 全局配置 + Field 覆盖，还是由 ArrayTable virtual 时自动切到 'blur'？
    commit: 'blur',
  });

  return (
    <Form form={form} onSubmit={(v) => api.prices.bulkUpdate(v.rows)}>
      <Toolbar />
      <ArrayTable
        name="rows"
        rowKey="id" // 稳定 key：排序 / 过滤只换顺序，单元格不 remount
        virtual={{ height: 640, rowHeight: 36, overscan: 10 }}
        sortable // 表头点击排序：排的是视图顺序，不改数据数组顺序
        // ❓ 视图排序 vs 数据排序：表头排序只改视图（推荐）；“上移 / 下移”才改数据。两个概念要在 API 上分开。
      >
        <ArrayTable.Column title="SKU" width={160} sortKey="sku">
          <Field name="sku" pattern="readPretty" decorator={<CellItem />} />
        </ArrayTable.Column>
        <ArrayTable.Column title="成本" width={120} sortKey="cost">
          <Field name="cost" decorator={<CellItem />} rules={[{ min: 0 }]}>
            <NumberInput />
          </Field>
        </ArrayTable.Column>
        <ArrayTable.Column title="加价率" width={120}>
          <Field name="markup" decorator={<CellItem />} rules={[{ min: 0 }, { max: 5 }]}>
            <NumberInput step={0.05} />
          </Field>
        </ArrayTable.Column>
        <ArrayTable.Column title="建议价" width={120}>
          {/* suggested 在 effects 里是 computed → 这里就是一个只读的普通 Field */}
          <Field name="suggested" decorator={<CellItem />}>
            <Money />
          </Field>
        </ArrayTable.Column>
        <ArrayTable.Column title="售价" width={140}>
          {/* 单元格校验时机：默认就是 commit 时（blur / Enter），打字不校验 */}
          <Field
            name="price"
            decorator={<CellItem />}
            rules={[{ required: true }, { min: 0 }]}
            warning={(v, ctx) => (v < ctx.record.cost ? '低于成本' : null)}
          >
            <NumberInput />
          </Field>
        </ArrayTable.Column>
        {/* 开发期验收：每个格子挂渲染计数，改一格只有该格 +1 */}
        <ArrayTable.Column title="渲染" width={60}>
          <RenderCounter />
        </ArrayTable.Column>
      </ArrayTable>
    </Form>
  );
}

function Toolbar() {
  // useFormState 带 selector：只订阅 belowCostCount，不订阅 2000 行
  const below = useFormState((f) => f.getValue('belowCostCount'));
  // useFormContext() 只拿实例、不订阅；useFormState(selector) 才订阅
  // ❓ 两个 hook 名字容易混：考虑改名 useFormInstance() / useWatch(selector)
  const form = useFormContext<Values>();
  return (
    <div className="flex gap-2 items-center">
      <span>{below} 行低于成本</span>
      {/* 批量写：form.batch 一次事务，2000 个 setValue 只触发一轮 reaction、一次渲染 */}
      <Button
        onClick={() =>
          form.batch(() => {
            form.query(/^rows\.\d+$/).forEach((row) => {
              row.query('./price').value = row.query('./suggested').value;
            });
          })
        }
      >
        全部采用建议价
      </Button>
      <Field name="globalMarkup" decorator={<CellItem />}>
        <Input />
      </Field>
      <Button onClick={() => form.batch(() => form.query(/^rows\.\d+\.markup$/).forEach((h) => (h.value = form.values.globalMarkup)))}>
        统一加价率
      </Button>
    </div>
  );
}
// ❓ 正则 query 在 2000 行上每次都全量匹配 path 字符串：要不要给“数组每行的某字段”一个专门写法，如 query('rows[*].markup')？
//    PLAN 说只要正则不要 glob；但 /^rows\.\d+\.markup$/ 写起来真的长。
