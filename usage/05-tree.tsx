// 05 树：后台菜单编辑器
// 覆盖：TreeField 递归模板、节点本身就是 record、每一层同一套联动和校验、
//      跨层移动（缩进 / 反缩进 / 移到某节点下）、禁止移入自身后代、层级上限。
// ⚠️ 假代码：只看 API 是否顺手，不能运行。
import { useForm, Form, Field, TreeField, VoidField, defineEffects, useNode, Submit } from 'shikiform';
import { FormItem, Input, Select, Switch } from './_ui';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { nanoid } from 'nanoid';
import { api } from '@/api';

interface MenuNode {
  id: string;
  title: string;
  kind: 'group' | 'page' | 'link';
  path?: string; // page 必填
  url?: string; // link 必填
  hidden: boolean;
  children: MenuNode[];
}

const MAX_DEPTH = 3;

const menuEffects = defineEffects<{ menus: MenuNode[] }>((e) => {
  // 对树：each 会走到每一层每个节点；row.depth 可用
  e.each('menus', (node) => {
    node.react(({ record, query }) => {
      query('./path').visible = record.kind === 'page';
      query('./path').required = record.kind === 'page';
      query('./url').visible = record.kind === 'link';
      query('./url').required = record.kind === 'link';
    });
  });
});

export function MenuEditor({ initial }: { initial: MenuNode[] }) {
  const form = useForm({ initialValues: { menus: initial }, effects: [menuEffects] });

  return (
    <Form form={form} onSubmit={(v) => api.menus.save(v.menus)}>
      <TreeField
        name="menus"
        rowKey="id"
        childrenKey="children"
        createNode={() => ({ id: nanoid(), title: '新菜单', kind: 'page', hidden: false, children: [] })}
        // 移动守卫：返回 string = 拒绝原因；“不能移入自身后代”是内建的，不用写
        canMove={({ node, toParent, toDepth }) =>
          toDepth > MAX_DEPTH
            ? `最多 ${MAX_DEPTH} 层`
            : toParent && toParent.kind !== 'group'
              ? '只能放进分组'
              : null
        }
      >
        {/* 节点模板：每个节点渲染一次；children 由 TreeField 递归渲染到 <TreeField.Children/> 位置 */}
        <VoidField name="node" className="flex gap-2 items-start">
          <NodeIndent />
          <Field name="title" decorator={<FormItem />} rules={[{ required: true }]}>
            <Input />
          </Field>
          <Field
            name="kind"
            decorator={<FormItem />}
            enum={[
              { label: '分组', value: 'group' },
              { label: '页面', value: 'page' },
              { label: '外链', value: 'link' },
            ]}
          >
            <Select />
          </Field>
          <Field
            name="path"
            decorator={<FormItem />}
            // 同级唯一：ctx.array 对树节点而言就是“兄弟节点数组”
            validator={(v, ctx) => (ctx.array.some((n, i) => i !== ctx.index && n.path === v) ? '同级路径重复' : null)}
          >
            <Input placeholder="/system/users" />
          </Field>
          <Field name="url" decorator={<FormItem />} rules={[{ format: 'url' }]}>
            <Input placeholder="https://" />
          </Field>
          <Field name="hidden" decorator={<FormItem />}>
            <Switch />
          </Field>
          <NodeActions />
        </VoidField>
        <TreeField.Children className="pl-6" />
      </TreeField>

      <Submit asChild>
        <Button>保存菜单</Button>
      </Submit>
    </Form>
  );
}

function NodeIndent() {
  const node = useNode<MenuNode>();
  return <span className="text-muted-foreground w-6">{node.hasChildren ? '▸' : '·'}</span>;
}

function NodeActions() {
  const node = useNode<MenuNode>();
  return (
    <div className="flex gap-1">
      <Button size="icon" variant="ghost" disabled={!node.canMoveUp} onClick={() => node.moveUp()}>↑</Button>
      <Button size="icon" variant="ghost" disabled={!node.canMoveDown} onClick={() => node.moveDown()}>↓</Button>
      {/* 缩进：变成上一个兄弟的最后一个子节点；canIndent 已经跑过 canMove 守卫 */}
      <Button size="icon" variant="ghost" disabled={!node.canIndent} onClick={() => node.indent()}>→</Button>
      <Button size="icon" variant="ghost" disabled={!node.canOutdent} onClick={() => node.outdent()}>←</Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost">⋯</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {/* 移到某个节点下：候选里自己和自己的后代被禁用（内建），其他守卫原因显示为 title */}
          {node.moveTargets().map((t) => (
            <DropdownMenuItem key={t.key} disabled={!t.allowed} title={t.reason ?? ''} onSelect={() => node.moveInto(t.path)}>
              移到「{t.record.title}」下
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onSelect={() => node.addChild()}>添加子菜单</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => node.remove()}>删除（含子菜单）</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
// ❓ moveInto 的目标用数据 path（'menus.0.children.2'）还是 rowKey（'id-xxx'）？
//    QUALITY.md 规定 path 是索引路径；但 UI 层“移到某节点下”用 rowKey 更稳（移动过程中索引会变）。
//    建议：对外 API 接受 path 或 { key }，内部统一换算成索引 path。
// ❓ 树的“节点模板 + <TreeField.Children/> 插槽”是否直观？另一种是 render prop：(node, children) => ...
