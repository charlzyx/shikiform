import { Button, Drawer } from 'antd';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AntdFormItem,
  AntdInput,
  AntdInputNumber,
  AntdSelect,
  DataTable,
  QueryFilter,
  useQueryTable,
  type DataTableColumn,
} from '@shikiform/antd';
import {
  ArrayField,
  Field,
  Form,
  ObjectField,
  defineEffects,
  useForm,
  useFormContext,
  useFormState,
  useWatch,
  type ShikiForm,
} from '@shikiform/react';
import { CITIES, PROVINCE_OPTIONS, STATUS_OPTIONS, makeRows, runQuery, type Row } from './data';
import { commitSearch, resetSearch } from './search';

interface QueryValues {
  keyword?: string;
  status?: string;
  note?: string;
  province?: string;
  city?: string;
  owner?: string;
  channel?: string;
  minScore?: number;
  tag?: string;
  customer?: { name?: string; city?: string };
  submitted: Record<string, unknown>;
  page: number;
  pageSize: number;
  rows: Row[];
  searchSeq: number;
  selectedKeys: string[];
}

const queryVirtual = {
  submitted: { virtual: true },
  rows: { virtual: true },
  searchSeq: { virtual: true },
  selectedKeys: { virtual: true },
};

function queryInitial(extra: Record<string, unknown> = {}) {
  return {
    keyword: '',
    status: '',
    submitted: {} as Record<string, unknown>,
    page: 1,
    pageSize: 10,
    rows: [] as Row[],
    searchSeq: 0,
    selectedKeys: [] as string[],
    ...extra,
  };
}

const readOnlyRows = defineEffects<QueryValues>(({ autorun }) => {
  autorun((d) => {
    d.rows.$pattern = 'readPretty';
  });
});

function CommitSelect(props: {
  id?: string;
  value?: unknown;
  onChange?: (value: unknown) => void;
  onBlur?: () => void;
  options?: { label: string; value: string | number }[];
  disabled?: boolean;
}) {
  const form = useFormContext();
  return (
    <AntdSelect
      {...props}
      onChange={(value) => {
        props.onChange?.(value);
        queueMicrotask(() => commitSearch(form, ['keyword', 'status']));
      }}
    />
  );
}

function SubmitJson() {
  const form = useFormContext();
  useFormState((state) => state.values);
  return <pre data-testid="submit-json">{JSON.stringify(form.getSubmitValues())}</pre>;
}

const nameColumn: DataTableColumn = {
  title: '名称',
  key: 'name',
  width: 180,
  render: () => (
    <Field name="name">
      <AntdInput />
    </Field>
  ),
};

const statusColumn: DataTableColumn = {
  title: '状态',
  key: 'status',
  width: 160,
  render: () => (
    <Field name="status" enum={STATUS_OPTIONS}>
      <AntdSelect />
    </Field>
  ),
};

function ServerQuery({
  count,
  columns,
  selection = false,
}: {
  count: number;
  columns: DataTableColumn[];
  selection?: boolean;
}) {
  const form = useFormContext();
  const dataRef = useRef<Row[] | null>(null);
  if (!dataRef.current) dataRef.current = makeRows(count);
  const table = useQueryTable<Row>({
    request: (args) => runQuery(dataRef.current ?? [], args),
  });
  const page = useWatch((d) => Number((d as any).page.$value ?? 1));
  const pageSize = useWatch((d) => Number((d as any).pageSize.$value ?? 10));
  const selected = useWatch((d) => {
    const value = (d as any).selectedKeys.$value;
    return Array.isArray(value) ? (value as string[]) : [];
  });
  return (
    <>
      <p>
        <span data-testid="fetch-count">{table.fetches}</span>
        <span data-testid="total">{table.total}</span>
        <span data-testid="page-indicator">{page}</span>
        {selection ? <span data-testid="selected-count">{selected.length}</span> : null}
      </p>
      {selection ? (
        <Button
          data-testid="batch-delete"
          onClick={() => {
            const keys = new Set(selected);
            dataRef.current = (dataRef.current ?? []).filter((row) => !keys.has(row.id));
            form.batch((d) => {
              const draft = d as any;
              draft.selectedKeys.$value = [];
              draft.searchSeq.$value = Number(draft.searchSeq.$value ?? 0) + 1;
            });
          }}
        >
          批量删除
        </Button>
      ) : null}
      {selection ? <SubmitJson /> : null}
      <DataTable
        name="rows"
        rowKey="id"
        columns={columns}
        loading={table.loading}
        pagination={{
          current: page,
          pageSize,
          total: table.total,
          onChange: (next, size) => {
            form.batch((d) => {
              const draft = d as any;
              draft.page.$value = next;
              draft.pageSize.$value = size;
            });
          },
        }}
        selection={
          selection
            ? { selectedKeys: selected, onChange: (keys) => form.setValue('selectedKeys', keys.map(String)) }
            : undefined
        }
      />
    </>
  );
}

function QueryShell({
  form,
  fields,
  filters,
  children,
}: {
  form: ShikiForm;
  fields: string[];
  filters: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Form form={form} onSubmit={() => commitSearch(form, fields)}>
      <QueryFilter onReset={() => resetSearch(form)}>{filters}</QueryFilter>
      {children}
    </Form>
  );
}

export function BasicDemo() {
  const form = useForm<QueryValues>({
    initialValues: queryInitial(),
    effects: [readOnlyRows],
    fields: queryVirtual,
  });
  return (
    <QueryShell
      form={form}
      fields={['keyword', 'status']}
      filters={
        <>
          <Field name="keyword" decorator={<AntdFormItem label="关键词" />}>
            <AntdInput placeholder="名称" />
          </Field>
          <Field name="status" enum={STATUS_OPTIONS} decorator={<AntdFormItem label="状态" />}>
            <AntdSelect placeholder="全部" />
          </Field>
        </>
      }
    >
      <Field name="status" ui="filter" enum={STATUS_OPTIONS} decorator={<AntdFormItem label="列筛选" />}>
        <CommitSelect />
      </Field>
      <ServerQuery count={25} columns={[nameColumn, statusColumn]} />
    </QueryShell>
  );
}

export function CollapseDemo() {
  const form = useForm<QueryValues>({
    initialValues: queryInitial({ note: '', province: '', city: '', owner: '', channel: '', tag: '' }),
    effects: [readOnlyRows],
    fields: queryVirtual,
  });
  return (
    <QueryShell
      form={form}
      fields={['keyword', 'status', 'note', 'province', 'city']}
      filters={
        <>
          <Field name="keyword" decorator={<AntdFormItem label="关键词" />}>
            <AntdInput />
          </Field>
          <Field name="status" enum={STATUS_OPTIONS} decorator={<AntdFormItem label="状态" />}>
            <AntdSelect />
          </Field>
          <Field name="province" decorator={<AntdFormItem label="省份" />}>
            <AntdInput />
          </Field>
          <Field name="city" decorator={<AntdFormItem label="城市" />}>
            <AntdInput />
          </Field>
          <Field name="owner" decorator={<AntdFormItem label="负责人" />}>
            <AntdInput />
          </Field>
          <Field name="channel" decorator={<AntdFormItem label="渠道" />}>
            <AntdInput />
          </Field>
          <Field name="minScore" decorator={<AntdFormItem label="最低分" />}>
            <AntdInputNumber />
          </Field>
          <Field name="tag" decorator={<AntdFormItem label="标签" />}>
            <AntdInput />
          </Field>
          <Field name="note" decorator={<AntdFormItem label="备注" />}>
            <AntdInput />
          </Field>
        </>
      }
    >
      <ServerQuery count={25} columns={[nameColumn]} />
    </QueryShell>
  );
}

function CityValue() {
  const city = useWatch((d) => String((d as any).city.$value ?? ''));
  return <span data-testid="city-value">{city}</span>;
}

const linkageEffects = defineEffects<{ province: string; city: string } & QueryValues>(({ autorun, watch }) => {
  autorun((d) => {
    const province = String(d.province.$value ?? '');
    d.city.$enum = (CITIES[province] ?? []).map((city) => ({ label: city, value: city }));
  });
  watch(
    (d) => d.province.$value,
    (d) => {
      d.city.$value = '';
    },
  );
  autorun((d) => {
    d.rows.$pattern = 'readPretty';
  });
});

export function LinkageDemo() {
  const form = useForm({
    initialValues: queryInitial({ province: '', city: '' }),
    effects: [linkageEffects],
    fields: queryVirtual,
  });
  return (
    <QueryShell
      form={form}
      fields={['province', 'city']}
      filters={
        <>
          <Field name="province" enum={PROVINCE_OPTIONS} decorator={<AntdFormItem label="省份" />}>
            <AntdSelect placeholder="省份" />
          </Field>
          <Field name="city" decorator={<AntdFormItem label="城市" />}>
            <AntdSelect placeholder="城市" />
          </Field>
        </>
      }
    >
      <CityValue />
      <ServerQuery count={25} columns={[nameColumn]} />
    </QueryShell>
  );
}

export function SelectionDemo() {
  const form = useForm<QueryValues>({
    initialValues: queryInitial(),
    effects: [readOnlyRows],
    fields: queryVirtual,
  });
  return (
    <QueryShell
      form={form}
      fields={['keyword', 'status']}
      filters={
        <>
          <Field name="keyword" decorator={<AntdFormItem label="关键词" />}>
            <AntdInput />
          </Field>
          <Field name="status" enum={STATUS_OPTIONS} decorator={<AntdFormItem label="状态" />}>
            <AntdSelect />
          </Field>
        </>
      }
    >
      <ServerQuery count={25} columns={[nameColumn]} selection />
    </QueryShell>
  );
}

const patternEffects = defineEffects<{ mode: string; rows: { id: string; name: string }[] }>(({ autorun }) => {
  autorun((d) => {
    d.rows.$pattern = d.mode.$value === 'edit' ? 'editable' : 'readPretty';
  });
});

export function PatternDemo() {
  const form = useForm({
    initialValues: {
      mode: 'read',
      rows: [
        { id: '1', name: 'Row 01' },
        { id: '2', name: 'Row 02' },
      ],
    },
    effects: [patternEffects],
  });
  return (
    <Form form={form}>
      <Field
        name="mode"
        enum={[
          { label: '只读', value: 'read' },
          { label: '编辑', value: 'edit' },
        ]}
        decorator={<AntdFormItem label="模式" />}
      >
        <AntdSelect />
      </Field>
      <DataTable name="rows" rowKey="id" columns={[nameColumn]} pagination={false} />
    </Form>
  );
}

const tabEffects = defineEffects<{ tab: string; account: { name: string }; contact: { email: string } }>(({ autorun }) => {
  autorun((d) => {
    d.contact.$display = d.tab.$value === 'contact' ? 'visible' : 'hidden';
  });
});

function ContactErrors() {
  const errors = useWatch((d) => {
    const list = (d as any).contact.$errors as readonly string[];
    return list.join(' ');
  });
  return <span data-testid="contact-errors">{errors}</span>;
}

export function TabsDemo() {
  const form = useForm({
    initialValues: { tab: 'account', account: { name: '' }, contact: { email: '' } },
    effects: [tabEffects],
  });
  const [result, setResult] = useState('');
  return (
    <Form
      form={form}
      onSubmit={(values) => {
        const email = (values as { contact?: { email?: string } }).contact?.email ?? '';
        setResult(`ok:${email}`);
      }}
      onSubmitFailed={() => setResult('failed')}
    >
      <p>
        <Button data-testid="tab-account" onClick={() => form.setValue('tab', 'account')}>
          账户
        </Button>
        <Button data-testid="tab-contact" onClick={() => form.setValue('tab', 'contact')}>
          联系
        </Button>
      </p>
      <ObjectField name="account">
        <Field name="name" decorator={<AntdFormItem label="姓名" />}>
          <AntdInput />
        </Field>
      </ObjectField>
      <ObjectField name="contact">
        <Field name="email" rules={[{ required: true, message: '请填写邮箱' }]} decorator={<AntdFormItem label="邮箱" />}>
          <AntdInput />
        </Field>
      </ObjectField>
      <p>
        <ContactErrors />
      </p>
      <Button type="primary" htmlType="submit" data-testid="submit">
        提交
      </Button>
      <span data-testid="submit-result">{result}</span>
    </Form>
  );
}

const nestedEffects = defineEffects<QueryValues & { lines: { sku: string; qty: number; price: number; total: number }[] }>(
  ({ autorun }) => {
    autorun((d) => {
      d.rows.$pattern = 'readPretty';
    });
    autorun.each(
      (d) => d.lines,
      (row) => {
        row.total.$value = Number(row.qty.$value || 0) * Number(row.price.$value || 0);
      },
    );
  },
);

function DrawerEditor() {
  const form = useFormContext();
  const open = useWatch((d) => Boolean((d as any).drawerOpen.$value));
  return (
    <>
      <Button data-testid="open-drawer" onClick={() => form.setValue('drawerOpen', true)}>
        编辑明细
      </Button>
      <Drawer title="明细" open={open} onClose={() => form.setValue('drawerOpen', false)} destroyOnClose={false}>
        <ArrayField name="lines">
          {(_row, index) => (
            <div data-testid={`line-${index}`} style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
              <Field name="sku" decorator={<AntdFormItem label="SKU" />}>
                <AntdInput />
              </Field>
              <Field name="qty" decorator={<AntdFormItem label="数量" />}>
                <AntdInputNumber />
              </Field>
              <Field name="price" decorator={<AntdFormItem label="单价" />}>
                <AntdInputNumber />
              </Field>
              <Field name="total" decorator={<AntdFormItem label="小计" />}>
                <AntdInput />
              </Field>
            </div>
          )}
        </ArrayField>
      </Drawer>
    </>
  );
}

export function NestedDemo() {
  const form = useForm({
    initialValues: {
      ...queryInitial({ customer: { name: '', city: '' } }),
      lines: [{ sku: 'A', qty: 2, price: 5, total: 0 }],
      drawerOpen: false,
    },
    effects: [nestedEffects],
    fields: { ...queryVirtual, drawerOpen: { virtual: true } },
  });
  return (
    <QueryShell
      form={form}
      fields={['customer.name']}
      filters={
        <ObjectField name="customer">
          <Field name="name" decorator={<AntdFormItem label="客户名称" />}>
            <AntdInput />
          </Field>
          <Field name="city" decorator={<AntdFormItem label="客户城市" />}>
            <AntdInput />
          </Field>
        </ObjectField>
      }
    >
      <DrawerEditor />
      <ServerQuery count={25} columns={[nameColumn]} />
    </QueryShell>
  );
}

function MountProbe() {
  useEffect(() => {
    const bump = (delta: number) => {
      const el = document.getElementById('mount-count');
      if (!el) return;
      el.textContent = String(Math.max(0, Number(el.textContent || '0') + delta));
    };
    bump(1);
    return () => bump(-1);
  }, []);
  return null;
}

export function VirtualDemo() {
  const rows = useRef(makeRows(200));
  const form = useForm({
    initialValues: { rows: rows.current },
    effects: [readOnlyRows],
    fields: { rows: { virtual: true } },
  });
  return (
    <Form form={form}>
      <div id="mount-count" data-testid="mount-count">
        0
      </div>
      <div data-testid="total" data-total="200">
        200
      </div>
      <DataTable
        name="rows"
        rowKey="id"
        virtualScroll
        scrollY={320}
        pagination={false}
        columns={[
          {
            title: '名称',
            key: 'name',
            width: 240,
            render: () => (
              <>
                <MountProbe />
                <Field name="name">
                  <AntdInput />
                </Field>
              </>
            ),
          },
        ]}
      />
    </Form>
  );
}
