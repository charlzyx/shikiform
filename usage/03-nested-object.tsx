// 03 嵌套对象：企业资料
// 覆盖：ObjectField 相对名、同一个子表单组件复用两次（注册地址 / 办公地址）、
//      record 作用域的 effect 写一次作用到两个实例、“同注册地址”开关。
// ⚠️ 假代码：只看 API 是否顺手，不能运行。
import { useForm, Form, Field, ObjectField, Enum, defineEffects, Submit } from 'shikiform';
import { CascaderPlus } from 'shikiform/pro';
import { FormItem, Input, Switch } from './_ui';
import { Button } from '@/components/ui/button';
import { api } from '@/api';

interface Address {
  region: string[]; // 省 / 市 / 区
  street: string;
  zip?: string;
}
interface Company {
  name: string;
  creditCode: string;
  registeredAddress: Address;
  officeSameAsRegistered: boolean;
  officeAddress: Address;
  contact: { name: string; phone: string };
}

// 懒加载树枚举：级联按需加载子级，结果按父级路径拼回树
const RegionEnum = Enum.lazyTree(async (parent) => api.regions.children(parent?.value ?? null));

// 可复用的“地址”子表单：里面全是相对名，不知道自己被挂在哪
function AddressFields() {
  return (
    <>
      <Field name="region" decorator={<FormItem label="省市区" />} enum={RegionEnum} rules={[{ required: true }]}>
        <CascaderPlus />
      </Field>
      <Field name="street" decorator={<FormItem label="详细地址" />} rules={[{ required: true }]}>
        <Input />
      </Field>
      <Field name="zip" decorator={<FormItem label="邮编" />} rules={[{ pattern: /^\d{6}$/, message: '6 位数字' }]}>
        <Input />
      </Field>
    </>
  );
}

// 地址模块自己的 effect：写一次，挂到两个 record 上
// ❓ e.scope 接受数组 / 正则，让一个模块 effect 作用于多个同构对象——还是要求每处显式 e.scope 一次？
const addressEffects = defineEffects<Address>((e) => {
  e.react(({ record, query }) => {
    // 直辖市没有区一级时，邮编非必填（假业务规则，演示 record 作用域）
    query('./zip').required = record.region?.length === 3;
  });
});

const companyEffects = defineEffects<Company>((e) => {
  e.scope(['registeredAddress', 'officeAddress'], addressEffects);

  // “同注册地址”：办公地址整块隐藏，值保留（visible=false 的默认语义：不渲染、保留值、跳过校验）
  e.react(({ root, query }) => {
    query('officeAddress').visible = !root.officeSameAsRegistered;
  });
});

export function CompanyProfileForm({ initial }: { initial: Company }) {
  const form = useForm<Company>({ initialValues: initial, effects: [companyEffects] });

  return (
    <Form
      form={form}
      onSubmit={(v) =>
        // 提交时自己决定 office 用哪份；隐藏 ≠ 不提交
        // ❓ “隐藏字段提交时保留值”是 PLAN 默认语义；这里业务想要的是“隐藏时用另一份值”，只能在 onSubmit 里手写。
        api.company.save({ ...v, officeAddress: v.officeSameAsRegistered ? v.registeredAddress : v.officeAddress })
      }
    >
      <Field name="name" decorator={<FormItem label="企业名称" />} rules={[{ required: true }]}>
        <Input />
      </Field>
      <Field
        name="creditCode"
        decorator={<FormItem label="统一社会信用代码" />}
        rules={[{ required: true }, { pattern: /^[0-9A-Z]{18}$/, message: '18 位大写字母或数字' }]}
      >
        <Input />
      </Field>

      <ObjectField name="registeredAddress" decorator={<FormItem label="注册地址" />}>
        <AddressFields />
      </ObjectField>

      <Field name="officeSameAsRegistered" decorator={<FormItem label="办公地址同注册地址" inline />}>
        <Switch />
      </Field>

      {/* ObjectField 也是 Field：有 visible，有 decorator；隐藏时子字段一起隐藏 */}
      <ObjectField name="officeAddress" decorator={<FormItem label="办公地址" />}>
        <AddressFields />
      </ObjectField>

      <ObjectField name="contact" decorator={<FormItem label="联系人" />}>
        <Field name="name" decorator={<FormItem label="姓名" />} rules={[{ required: true }]}>
          <Input />
        </Field>
        <Field
          name="phone"
          decorator={<FormItem label="手机" />}
          rules={[{ required: true }, { pattern: /^1\d{10}$/, message: '手机号格式不对' }]}
        >
          <Input />
        </Field>
      </ObjectField>

      <Submit asChild>
        <Button>保存</Button>
      </Submit>
    </Form>
  );
}
