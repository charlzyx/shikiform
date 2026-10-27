// 05 树：后台菜单编辑器（2026-10-27：Tree 节点多一个 pos 二维坐标）
// 覆盖：TreeField 递归模板，节点即 record；
//      pos = 节点的“二维坐标” = 索引路径，如 [0, 2, 1]（第 0 个根节点 → 它的第 2 个子 → 它的第 1 个子）
//        pos.length = 层级 depth（根节点 depth = 1），pos.at(-1) = 在兄弟里的 index；
//        数组行只有 index，没有 pos。
//      数据 path 由 pos 推出：[0,2,1] → 'menus.0.children.2.children.1'（children 键可配）；
//      移动全部用 pos 表达：move(fromPos, toPos)、indent / outdent、moveUp / moveDown；
//      “禁止移入自身后代” = toPos 以 fromPos 为前缀；按 depth 做联动和分层校验；
//      定位某个节点：先 findPos 找到 pos，再 pathOf(pos) 得到精确 path（pos 不是查询过滤条件）。
// ⚠️ 假代码：只看 API 是否顺手，不能运行。
import { useForm, Form, Field, TreeField, defineEffects, findPos, pathOf, useNode, useTree, Submit } from 'shikiform';
import { FormItem, Input, Select, Switch } from './_ui';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { nanoid } from 'nanoid';
import { api } from '@/api';

interface MenuNode {
  id: string; // 稳定 id：只做 React key / 拖拽身份，不做 path（QUALITY：path 永远是索引路径）
  title: string;
  kind: 'group' | 'page' | 'link';
  icon?: string; // 只有第 1 层显示图标
  path?: string; // page 必填
  url?: string; // link 必填
  hidden: boolean;
  children: MenuNode[];
}

// ❓ pos 的表示：number[]（当前）vs 字符串 '0-2-1'。
//    number[] 便于算（前缀、父级、depth、比较）；字符串便于当 Map key / 序列化。
//    建议：对外一律 number[]（类型 Pos = readonly number[]），另给 posKey(pos) => '0-2-1' 做 key 用；
//    前缀判断 isPosPrefix([0,2], [0,2,1,0]) === true 由 core 导出。

const MAX_DEPTH = 3;

const menuEffects = defineEffects<{ menus: MenuNode[] }>(({ reaction, query }) => {
  // 对 TreeField，reaction.each 走到每一层每个节点；node 是当前节点的 handle（相对性 = 回调参数，不写相对路径字符串）
  //   node.$pos  : [0, 2, 1]        （树节点才有；数组行只有 index）
  //   node.$pos.length = depth 3，node.$pos.at(-1) = 兄弟中的 index 1
  //   node.$path : 'menus.0.children.2.children.1'
  reaction.each(
    (d) => d.menus,
    (node) => {
      const depth = node.$pos.length;
      const kind = node.kind.$value;
      node.icon.$visible = depth === 1; // 按层级联动：只有顶层菜单有图标
      node.path.$visible = kind === 'page';
      node.path.$required = kind === 'page';
      node.url.$visible = kind === 'link';
      node.url.$required = kind === 'link';
      // 不同层级可选的 kind 不同：第 1 层只能是分组，最深层不能是分组
      node.kind.$enum = KIND_OPTIONS.filter((o) =>
        depth === 1 ? o.value === 'group' : depth === MAX_DEPTH ? o.value !== 'group' : true,
      );
    },
  );
  // ❓ 节点 handle 上的坐标叫 node.$pos（$ 前缀，因为不带 $ 的都是子字段）；depth 要不要再给一个 node.$depth？
  // ❓ node.path 这里是业务子字段（菜单路由），node.$path 是数据路径——$ 规则正好避免了撞名。

  // 定位某个节点：先按条件找到 pos，再由 pos 推出精确 path（例：首页菜单永远不可隐藏）
  reaction((d) => {
    const pos = findPos(d.menus.$value, (n) => n.id === 'home'); // → [0, 0] 或 undefined
    if (pos) query(pathOf('menus', pos)).hidden.$disabled = true; // pathOf → 'menus.0.children.0'
  });
  // ❓ 树定位 helper 的形态：findPos(value, pred) + pathOf(rootPath, pos) + query(path)（当前），
  //    还是给树 handle 一个 d.menus.$at(pos)？两者都不是“按 pos 过滤”，只是坐标 → path。
});

const KIND_OPTIONS = [
  { label: '分组', value: 'group' },
  { label: '页面', value: 'page' },
  { label: '外链', value: 'link' },
] as const;

export function MenuEditor({ initial }: { initial: MenuNode[] }) {
  const form = useForm({ initialValues: { menus: initial }, effects: [menuEffects] });

  return (
    <Form form={form} onSubmit={(v) => api.menus.save(v.menus)}>
      <TreeField
        name="menus"
        rowKey="id" // React key 用稳定 id；pos 每次移动都会变，不能当 key
        childrenKey="children" // pos → path 时用：[0,2,1] → menus.0.children.2.children.1
        createNode={() => ({ id: nanoid(), title: '新菜单', kind: 'page', hidden: false, children: [] })}
        // 移动守卫：返回 string = 拒绝原因。
        // 内建规则（不用写）：isPosPrefix(from, to) → '不能移入自身或其后代'
        //   例：from = [0, 2]，to = [0, 2, 1, 0] 以 [0, 2] 开头 → 拒绝；to = [0, 3] → 允许
        canMove={({ from, to, node, toParent }) => {
          const subtreeHeight = heightOf(node); // 被移动子树自身的高度（含自己 = 1）
          if (to.length - 1 + subtreeHeight > MAX_DEPTH) return `移动后超过 ${MAX_DEPTH} 层`;
          if (toParent && toParent.kind !== 'group') return '只能放进分组';
          return null;
        }}
      >
        {/* 节点模板：每个节点渲染一次；子节点递归渲染到 <TreeField.Children/> 的位置 */}
        <div className="flex gap-2 items-start">
          <NodeIndent />
          <Field name="icon" decorator={<FormItem />}>
            <Input placeholder="图标" />
          </Field>
          <Field
            name="title"
            decorator={<FormItem />}
            rules={[{ required: true }]}
            // 分层校验：ctx.depth 决定规则
            validator={(v, ctx) => (ctx.depth === 1 && v.length > 6 ? '顶层菜单标题 ≤ 6 个字' : null)}
          >
            <Input />
          </Field>
          <Field name="kind" decorator={<FormItem />}>
            <Select />
          </Field>
          <Field
            name="path"
            decorator={<FormItem />}
            // 同级唯一：ctx.array = 兄弟节点，ctx.index = pos.at(-1)
            // 子路径必须以父路径开头：ctx.parent = 父节点 record
            validator={(v, ctx) =>
              ctx.array.some((n, i) => i !== ctx.index && n.path === v)
                ? '同级路径重复'
                : ctx.parent?.path && !v.startsWith(ctx.parent.path)
                  ? `应以 ${ctx.parent.path} 开头`
                  : null
            }
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
        </div>
        <TreeField.Children className="pl-6" />
      </TreeField>

      <TreeOutline />
      <Submit asChild>
        <Button>保存菜单</Button>
      </Submit>
    </Form>
  );
}

function NodeIndent() {
  const node = useNode<MenuNode>();
  // node.pos = [0, 2, 1]、node.depth = 3、node.index = 1、node.path = 'menus.0.children.2.children.1'
  return <span className="text-muted-foreground w-10 tabular-nums">{node.pos.map((i) => i + 1).join('.')}</span>; // 显示 1.3.2
}

function NodeActions() {
  const node = useNode<MenuNode>();
  return (
    <div className="flex gap-1">
      {/* moveUp：[0,2,1] → [0,2,0]；moveDown：[0,2,1] → [0,2,2]（同父内） */}
      <Button size="icon" variant="ghost" disabled={!node.canMoveUp} onClick={() => node.moveUp()}>↑</Button>
      <Button size="icon" variant="ghost" disabled={!node.canMoveDown} onClick={() => node.moveDown()}>↓</Button>
      {/* indent：成为前一个兄弟的最后一个子：[0,2,1] → [0,2,0,k]（k = 前一个兄弟原有子数）；index 为 0 时不可缩进 */}
      <Button size="icon" variant="ghost" disabled={!node.canIndent} onClick={() => node.indent()}>→</Button>
      {/* outdent：成为父节点的下一个兄弟：[0,2,1] → [0,3]；depth 为 1 时不可反缩进 */}
      <Button size="icon" variant="ghost" disabled={!node.canOutdent} onClick={() => node.outdent()}>←</Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost">⋯</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {/* 候选目标：所有分组节点；自己和后代（pos 前缀相同）被内建规则禁用，其余跑 canMove */}
          {node.moveTargets({ asLastChildOf: (n) => n.kind === 'group' }).map((t) => (
            <DropdownMenuItem key={t.key} disabled={!t.allowed} title={t.reason ?? ''} onSelect={() => node.moveTo(t.to)}>
              移到「{t.record.title}」下（{t.parentPos.map((i) => i + 1).join('.')}）
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem disabled={node.depth >= 3} onSelect={() => node.addChild()}>添加子菜单</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => node.remove()}>删除（含子菜单）</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// 树外部操作：useTree(name) —— 全部用 pos
function TreeOutline() {
  const tree = useTree<MenuNode>('menus');
  return (
    <div className="text-xs text-muted-foreground space-y-1">
      <p>共 {tree.count} 个节点，最深 {tree.maxDepth} 层</p>
      <p>[0,2,1] 的 path：{tree.pathOf([0, 2, 1])}（menus.0.children.2.children.1）</p>
      <p>'menus.0.children.2' 的 pos：{JSON.stringify(tree.posOf('menus.0.children.2'))}（[0,2]）</p>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          // move(fromPos, toPos)：把 [1, 0] 移成 [0, 2, 0]（移到 [0,2] 的第一个子位置）
          // 非法：tree.move([0, 2], [0, 2, 1, 0]) → 抛 ShikiTreeMoveError（目标在自身子树内）
          const r = tree.move([1, 0], [0, 2, 0]);
          if (!r.ok) console.warn(r.reason);
        }}
      >
        演示：move([1,0] → [0,2,0])
      </Button>
      {/* 其他：tree.get(pos)、tree.insert(pos, node)、tree.remove(pos)、tree.walk((node, pos) => …) */}
    </div>
  );
}
// ❓ toPos 的语义：“移动完成后的最终坐标”（当前）还是“移除前树上的插入点”？
//    同父内下移时两者差 1（[0,1] → [0,3]：移除后原 [0,3] 变 [0,2]）。
//    建议：最终坐标（读起来 = 移完后它在哪），引擎内部自己处理移除带来的偏移。
// ❓ 拖拽中 pos 稳定吗？建议：拖拽期间数据不动，pos 不变；hover 只算“预览 toPos”，drop 时一次 move 事务；
//    move 之后所有受影响节点的 pos / path 都变（这正是 key 必须用 rowKey 而不能用 pos 的原因）。
// ❓ 节点身份：effect / 草稿 / 展开状态按什么挂？按 pos 会在移动后“串到别的节点”上，按 rowKey 才跟着节点走。
//    建议：UI 状态（展开、选择、草稿）按 rowKey 挂；数据读写、校验错误按 path（由 pos 推出）。

function heightOf(n: MenuNode): number {
  return 1 + Math.max(0, ...n.children.map(heightOf));
}
