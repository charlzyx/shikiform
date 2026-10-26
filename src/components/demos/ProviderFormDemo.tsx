// ProviderFormDemo: 供应商 / provider 真实复杂表单。
// 基本信息 + 认证方式切换（API Key / OAuth，二者字段显隐互斥，隐藏值保留）
// + 模型多选 + 限流（数字）+ 高级折叠（收起后值保留，提交仍在）。
// React 18 hooks only: useState.
import { useState } from 'react';
import { Card } from '../../ui/index';
import '../../styles/shiki.css';

const ALL_MODELS = ['gpt-5', 'gpt-5-mini', 'claude-sonnet', 'deepseek-chat', 'qwen-max'];

export default function ProviderFormDemo() {
  const [name, setName] = useState('');
  const [type, setType] = useState('openai');
  const [desc, setDesc] = useState('');
  const [auth, setAuth] = useState<'apiKey' | 'oauth'>('apiKey');
  const [apiKey, setApiKey] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [models, setModels] = useState<string[]>(['gpt-5']);
  const [rateLimit, setRateLimit] = useState('60');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [timeout, setTimeout] = useState('30');
  const [retries, setRetries] = useState('3');
  const [submitted, setSubmitted] = useState<Record<string, unknown> | null>(null);

  const toggleModel = (m: string) => {
    setModels((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  };

  const onSubmit = () => {
    setSubmitted({
      name,
      type,
      description: desc,
      auth,
      apiKey: auth === 'apiKey' ? apiKey : undefined,
      oauth: auth === 'oauth' ? { clientId, clientSecret } : undefined,
      models,
      rateLimit: Number(rateLimit),
      advanced: { timeout: Number(timeout), retries: Number(retries) },
    });
  };

  const onReset = () => {
    setName('');
    setDesc('');
    setAuth('apiKey');
    setApiKey('');
    setClientId('');
    setClientSecret('');
    setModels([]);
    setRateLimit('60');
    setTimeout('30');
    setRetries('3');
    setSubmitted(null);
  };

  return (
    <Card>
      <h3>基本信息</h3>
      <div className="shiki-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div>
          <div className="shiki-label">供应商名称</div>
          <input data-testid="provider-name" className="shiki-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如 OpenAI" />
        </div>
        <div>
          <div className="shiki-label">类型</div>
          <select data-testid="provider-type" className="shiki-input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="deepseek">DeepSeek</option>
            <option value="custom">自定义</option>
          </select>
        </div>
      </div>
      <div className="shiki-label">描述</div>
      <textarea data-testid="provider-desc" className="shiki-input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="这个供应商是做什么的…" />

      <h3>认证方式（二者互斥）</h3>
      <div style={{ display: 'flex', gap: 16 }}>
        <label>
          <input data-testid="provider-auth-apikey" type="radio" name="provider-auth" checked={auth === 'apiKey'} onChange={() => setAuth('apiKey')} /> API Key
        </label>
        <label>
          <input data-testid="provider-auth-oauth" type="radio" name="provider-auth" checked={auth === 'oauth'} onChange={() => setAuth('oauth')} /> OAuth
        </label>
      </div>
      {auth === 'apiKey' ? (
        <div>
          <div className="shiki-label">API Key</div>
          <input data-testid="provider-api-key" className="shiki-input" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
        </div>
      ) : (
        <div>
          <div className="shiki-label">Client ID</div>
          <input data-testid="provider-oauth-client-id" className="shiki-input" value={clientId} onChange={(e) => setClientId(e.target.value)} />
          <div className="shiki-label">Client Secret</div>
          <input data-testid="provider-oauth-client-secret" className="shiki-input" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
        </div>
      )}
      <p className="shiki-muted">切换认证方式时，另一组的输入框隐藏但值保留：切回来还能看到之前填的内容。</p>

      <h3>模型多选</h3>
      <div className="shiki-options">
        {ALL_MODELS.map((m) => (
          <label key={m} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input data-testid={`provider-model-${m}`} type="checkbox" checked={models.includes(m)} onChange={() => toggleModel(m)} />
            {m}
          </label>
        ))}
      </div>

      <div className="shiki-label">限流（每分钟请求数）</div>
      <input data-testid="provider-rate-limit" className="shiki-input" type="number" min={0} value={rateLimit} onChange={(e) => setRateLimit(e.target.value)} />

      <div style={{ marginTop: 16 }}>
        <button data-testid="provider-advanced-toggle" className="shiki-btn" type="button" onClick={() => setAdvancedOpen((v) => !v)}>
          {advancedOpen ? '收起高级设置' : '展开高级设置'}
        </button>
        {advancedOpen ? (
          <div data-testid="provider-advanced">
            <div className="shiki-label">超时（秒）</div>
            <input data-testid="provider-advanced-timeout" className="shiki-input" type="number" value={timeout} onChange={(e) => setTimeout(e.target.value)} />
            <div className="shiki-label">重试次数</div>
            <input data-testid="provider-advanced-retries" className="shiki-input" type="number" value={retries} onChange={(e) => setRetries(e.target.value)} />
          </div>
        ) : (
          <p className="shiki-muted">高级设置已收起，但超时 / 重试次数的值保留，提交时仍在。</p>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button data-testid="provider-submit" className="shiki-btn" type="button" onClick={onSubmit}>提交</button>
        <button data-testid="provider-reset" className="shiki-btn" type="button" onClick={onReset}>重置</button>
      </div>
      {submitted ? (
        <pre data-testid="provider-output" className="shiki-code">{JSON.stringify(submitted, null, 2)}</pre>
      ) : null}
    </Card>
  );
}
