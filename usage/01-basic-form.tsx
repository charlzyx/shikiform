// 01 基础表单：新建员工
// 覆盖：Field + Decorator(FormItem) + Component 分离、rules 写在 JSX、submit / reset、submit={false}（确认密码不提交）
// ⚠️ 假代码：只看 API 是否顺手，不能运行。
import { useForm, Form, Field, Submit, Reset } from 'shikiform';
import { FormItem, Input, Select, Switch, Textarea } from './_ui';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { api } from '@/api';

interface Employee {
  name: string;
  email: string;
  password: string;
  department: 'rd' | 'pm' | 'ops';
  remote: boolean;
  bio?: string;
}

// 表单实例在组件外创建也可以；在组件里用 useForm 则跟随组件生命周期。
// ❓ createForm（模块级单例）和 useForm（组件内）两种都给，还是只给 useForm？
export function EmployeeCreatePage() {
  const form = useEmployeeForm();

  return (
    <Form
      form={form}
      // 校验失败不会调用 onSubmit；返回 Promise 时 form.submitting = true
      onSubmit={async (values) => {
        // values 里没有 confirmPassword（submit={false}）
        await api.employees.create(values);
        toast.success('已创建');
        form.reset();
      }}
      // 校验失败：自动滚到第一个错误字段并聚焦
      onSubmitFailed={(errors) => console.warn(errors)}
    >
      <Field name="name" decorator={<FormItem label="姓名" />} rules={[{ required: true }, { maxLength: 20 }]}>
        <Input placeholder="真实姓名" />
      </Field>

      <Field
        name="email"
        decorator={<FormItem label="邮箱" help="用于登录" />}
        rules={[{ required: true }, { format: 'email', message: '邮箱格式不对' }]}
      >
        <Input type="email" />
      </Field>

      <Field
        name="password"
        decorator={<FormItem label="初始密码" />}
        rules={[{ required: true }, { minLength: 8, message: '至少 8 位' }]}
      >
        <Input type="password" />
      </Field>

      {/* submit={false}：普通 Field，有输入、参与校验，只是提交时被过滤（2026-10-27 起不再有 Transient 类型） */}
      <Field
        name="confirmPassword"
        submit={false}
        decorator={<FormItem label="确认密码" />}
        // 跨字段：ctx.record 是当前对象（这里是根），不用写绝对路径
        validator={(value, ctx) => (value === ctx.record.password ? null : '两次密码不一致')}
        // ❓ 确认密码只读 password，单向依赖：password 改了要不要自动重校验 confirmPassword？
        //    我的倾向：validator 里读到的字段自动成为依赖，已 touched 的才重校验。
      >
        <Input type="password" />
      </Field>

      <Field name="department" decorator={<FormItem label="部门" />} enum={DEPARTMENTS} rules={[{ required: true }]}>
        <Select placeholder="请选择" />
      </Field>

      <Field name="remote" decorator={<FormItem label="远程办公" inline />}>
        <Switch />
      </Field>

      <Field name="bio" decorator={<FormItem label="简介" />} rules={[{ maxLength: 200 }]}>
        <Textarea rows={4} />
      </Field>

      {/* 纯布局：普通 JSX，不产生 path，也不产生 address */}
      <div className="flex gap-2">
        {/* Submit / Reset 只是读 form 状态的按钮：submitting 时 loading，校验中禁用 */}
        <Submit asChild>
          <Button>创建</Button>
        </Submit>
        <Reset asChild>
          <Button variant="outline">重置</Button>
        </Reset>
      </div>
    </Form>
  );
}

const DEPARTMENTS = [
  { label: '研发', value: 'rd' },
  { label: '产品', value: 'pm' },
  { label: '运维', value: 'ops' },
];
// ❓ enum 直接收数组 vs 必须 Enum.from(...)：建议两者都收，数组内部自动包成静态 Enum。

function useEmployeeForm() {
  return useForm<Employee & { confirmPassword?: string }>({
    initialValues: { name: '', email: '', password: '', department: undefined as never, remote: false },
    // 全表单默认校验时机：blur + submit；单个 Field 可用 trigger 覆盖
    validateTrigger: ['onBlur', 'onSubmit'],
  });
}

// 不用 <Submit> 组件也行：命令式 API
export function ImperativeButtons({ form }: { form: ReturnType<typeof useEmployeeForm> }) {
  return (
    <>
      <Button
        onClick={() =>
          form.submit(async (values) => {
            await api.employees.create(values);
          })
        }
      >
        保存
      </Button>
      {/* reset：值回 initialValues，errors / touched 清空，计算值重算 */}
      <Button variant="ghost" onClick={() => form.reset()}>
        清空
      </Button>
      {/* 只重置一个字段 */}
      <Button variant="ghost" onClick={() => form.reset('bio')}>
        清空简介
      </Button>
    </>
  );
}
