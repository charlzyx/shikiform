// NestedObjectDemo: ShikiForm + ObjectField 嵌套对象。
// provider 对象里嵌 api 配置对象，子字段用相对名（name / baseUrl / model），
// 不写 provider.api.baseUrl 这种全路径。path 不含 Void（本页没用 VoidField）。
// React 18 hooks only: useState.
import { useState } from 'react';
import { Field, ObjectField, ShikiForm, useScope } from '../../react/form';
import { createShikiStore } from '../../core/store';
import { Card } from '../../ui/index';
import '../../styles/shiki.css';

function SubmitView() {
  const { root } = useScope();
  const [submitted, setSubmitted] = useState<Record<string, unknown> | null>(null);
  return (
    <div>
      <button data-testid="nested-submit" className="shiki-btn" type="button" onClick={() => setSubmitted(root)}>
        提交
      </button>
      {submitted ? (
        <pre data-testid="nested-output" className="shiki-code">{JSON.stringify(submitted, null, 2)}</pre>
      ) : null}
    </div>
  );
}

export default function NestedObjectDemo() {
  const [store] = useState(() =>
    createShikiStore({
      initialValues: { provider: { name: '', api: { baseUrl: '', model: '' } } },
      excludeFromSubmit: [],
    }),
  );
  return (
    <Card>
      <ShikiForm store={store}>
        {/* ObjectField 渲染的 div 自带 data-address="provider" / "provider.api" */}
        <ObjectField name="provider">
          <div className="shiki-label">供应商（provider 对象）</div>
          <Field name="name" label="供应商名称">
            {(f) => (
              <input
                data-testid="nested-name"
                className="shiki-input"
                value={(f.value as string) ?? ''}
                onChange={(e) => f.setValue(e.target.value)}
                placeholder="例如 OpenAI"
              />
            )}
          </Field>
          <ObjectField name="api">
            <div className="shiki-label">API 配置（provider.api 对象，子字段用相对名）</div>
            <Field name="baseUrl" label="Base URL">
              {(f) => (
                <input
                  data-testid="nested-base-url"
                  className="shiki-input"
                  value={(f.value as string) ?? ''}
                  onChange={(e) => f.setValue(e.target.value)}
                  placeholder="https://api.example.com"
                />
              )}
            </Field>
            <Field name="model" label="默认模型">
              {(f) => (
                <input
                  data-testid="nested-model"
                  className="shiki-input"
                  value={(f.value as string) ?? ''}
                  onChange={(e) => f.setValue(e.target.value)}
                  placeholder="例如 gpt-5"
                />
              )}
            </Field>
          </ObjectField>
        </ObjectField>
        <div style={{ marginTop: 16 }}>
          <SubmitView />
        </div>
      </ShikiForm>
      <p className="shiki-muted">
        地址（data-address）：provider、provider.api、provider.api.baseUrl、provider.api.model。
        提交值（path）同样是 provider / provider.api / provider.api.baseUrl，不含 Void——本页没有 VoidField。
      </p>
      <pre data-testid="nested-address" className="shiki-code">
        provider / provider.api / provider.api.baseUrl / provider.api.model
      </pre>
    </Card>
  );
}
