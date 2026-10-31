// 12 超大表格：2000 行价格批量调整
// 覆盖：行虚拟化（只挂可视区）；字段级订阅（改一格只重渲染该格 + 真正依赖它的计算值）；
//      reaction.each 把重算限制在被改的行；按 record 缓存计算值；
//      rowKey 稳定，排序不 remount 不丢焦点；渲染计数用于验收。
//      输入在 change 时写入 store。
// ⚠️ 假代码：只看 API 是否顺手，不能运行。
import { useForm, Form, Field, defineEffects, useFormState, useFormContext } from 'shikiform';
import { ArrayTable, RenderCounter } from 'shikiform/pro';
import { CellItem, NumberInput, Input, Money } from './_ui';
import { Button } from '@/components/ui/button';
import { api } from '@/api';

interface PriceRow {
  id: string; sku: string; cost: number; markup: number; price: number;
  suggested?: number; belowCost?: boolean; // 计算字段
}
interface Values { rows: PriceRow[]; globalMarkup: number; belowCostCount?: number /* 计算字段 */ }

const priceEffects = defineEffects<Values>(({ reaction }) => {
  // 每行一个实例：只有这一行的 cost / markup / price 变了才重跑
  reaction.each(
    (d) => d.rows,
    (row) => {
      row.suggested.$value = Math.ceil(row.cost.$value * (1 + row.markup.$value));
      row.belowCost.$value = row.price.$value < row.cost.$value;
    },
  );
  // 全表聚合：读整表 rows.$value，任一行写入后重算。大表应避免这种读取，改用上面的 reaction.each。
  reaction((d) => {
    d.belowCostCount.$value = d.rows.$value.filter((r) => r.belowCost).length;
  });
});

export function BulkPriceEditor({ rows }: { rows: PriceRow[] }) {
  const form = useForm<Values>({
    initialValues: { rows, globalMarkup: 0.3 },
    effects: [priceEffects],
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
          {/* suggested 是计算字段（reaction 写 $value）→ 这里就是一个只读的普通 Field */}
          <Field name="suggested" decorator={<CellItem />}>
            <Money />
          </Field>
        </ArrayTable.Column>
        <ArrayTable.Column title="售价" width={140}>
          {/* 单元格校验时机：默认 onBlur + onSubmit，打字不校验 */}
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
      {/* 批量写：form.batch(d => …) 拿到和 effect 同一种 draft，一次事务，2000 个写入只触发一轮 reaction、一次渲染 */}
      <Button
        onClick={() =>
          form.batch((d) => {
            d.rows.$value.forEach((r, i) => {
              d.rows[i].price.$value = r.suggested; // 按 index 取精确 handle，不用正则匹配 path
            });
          })
        }
      >
        全部采用建议价
      </Button>
      <Field name="globalMarkup" decorator={<CellItem />}>
        <Input />
      </Field>
      <Button onClick={() => form.batch((d) => d.rows.$value.forEach((_, i) => (d.rows[i].markup.$value = d.globalMarkup.$value)))}>
        统一加价率
      </Button>
    </div>
  );
}
// ❓ form.batch(d => …) 复用 effect 的 draft（当前）：组件里的命令式写和 effect 一个写法。是否接受？
//    （2026-10-27 起定位数据只用精确 path，正则 query / 'rows[*].markup' 这类写法都不再需要。）
