// LinkageDemo: 同一页三组联动。
// 一对多：provider.type 一变 → apiKey 显隐 + baseUrl 必填 + 模型列表变（集中写在一处）。
// 多对一：姓名 + 邮箱 + 同意协议三个输入共同决定提交按钮是否禁用。
// 多对多：复用 src/examples/sku.ts 的 SKU 表做迷你版——颜色→配置过滤，反向亦然，
//   已不合法的当前选择在同一处清掉（不散落 per-field effect）。
// React 18 hooks only: useState / useMemo.
import { useMemo, useState } from 'react';
import { ALL_CONFIGS, ALL_COLORS, SKU_TABLE, availableAll, priceRange } from '../../examples/sku';
import { Card } from '../../ui/index';
import '../../styles/shiki.css';

const TYPE_MODELS: Record<string, string[]> = {
  openai: ['gpt-5', 'gpt-5-mini'],
  anthropic: ['claude-sonnet', 'claude-opus'],
  local: ['local-model'],
};

const COLOR_SLUG: Record<string, string> = { '黑色': 'black', '白色': 'white', '红色': 'red' };
const CONFIG_SLUG: Record<string, string> = { '基础版': 'basic', Pro: 'pro', Max: 'max' };

export default function LinkageDemo() {
  // ---- 一对多 ----
  const [type, setType] = useState('openai');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('gpt-5');
  const [oneError, setOneError] = useState('');
  const showApiKey = type !== 'local';
  const baseUrlRequired = type !== 'local';
  const models = TYPE_MODELS[type] ?? [];

  const changeType = (next: string) => {
    setType(next);
    // 集中 effect：类型一变，模型若不在新列表里就清掉；apiKey/baseUrl 按新语义走。
    const nextModels = TYPE_MODELS[next] ?? [];
    if (!nextModels.includes(model)) setModel('');
    setOneError('');
  };

  const submitOne = () => {
    if (baseUrlRequired && !baseUrl.trim()) {
      setOneError('baseUrl 必填');
      return;
    }
    setOneError('');
  };

  // ---- 多对一 ----
  const [manyName, setManyName] = useState('');
  const [manyEmail, setManyEmail] = useState('');
  const [manyAgree, setManyAgree] = useState(false);
  const manyReady = manyName.trim() !== '' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manyEmail) && manyAgree;

  // ---- 多对多（迷你 SKU） ----
  const [color, setColor] = useState<string | undefined>(undefined);
  const [config, setConfig] = useState<string | undefined>(undefined);
  const available = useMemo(
    () => availableAll(SKU_TABLE, { color, config }),
    [color, config],
  );
  // 迷你版只有颜色 + 配置两个维度（不含价格维度），所以最终 SKU 按这两维精确匹配，
  // 而不是复用要求三维齐全的 finalSku。
  const sku = useMemo(
    () => (color && config ? (SKU_TABLE.find((s) => s.color === color && s.config === config) ?? null) : null),
    [color, config],
  );
  const range = useMemo(() => priceRange(SKU_TABLE, { color, config }), [color, config]);

  const changeColor = (next: string | undefined) => {
    setColor(next);
    // 同一处清掉已不合法的选择：新颜色下配置不在可选范围里就清掉。
    const availConfigs = availableAll(SKU_TABLE, { color: next, config }).config as string[];
    if (config && !availConfigs.includes(config)) setConfig(undefined);
  };

  const changeConfig = (next: string | undefined) => {
    setConfig(next);
    const availColors = availableAll(SKU_TABLE, { color, config: next }).color as string[];
    if (color && !availColors.includes(color)) setColor(undefined);
  };

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <Card>
        <h3>一对多：一个源影响多个目标</h3>
        <div className="shiki-label">供应商类型</div>
        <select data-testid="linkage-type" className="shiki-input" value={type} onChange={(e) => changeType(e.target.value)}>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="local">本地（无 API Key）</option>
        </select>
        {showApiKey ? (
          <div>
            <div className="shiki-label">API Key</div>
            <input data-testid="linkage-api-key" className="shiki-input" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
          </div>
        ) : (
          <p data-testid="linkage-api-key-hidden" className="shiki-muted">本地类型：API Key 字段已隐藏，值保留、校验跳过。</p>
        )}
        <div className="shiki-label">Base URL{baseUrlRequired ? '（必填）' : '（选填）'}</div>
        <input data-testid="linkage-base-url" className="shiki-input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com" />
        {oneError ? <div data-testid="linkage-one-error" className="shiki-error">{oneError}</div> : null}
        <div className="shiki-label">模型（随类型变）</div>
        <select data-testid="linkage-model" className="shiki-input" value={model} onChange={(e) => setModel(e.target.value)}>
          <option value="">请选择</option>
          {models.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <button data-testid="linkage-one-submit" className="shiki-btn" type="button" onClick={submitOne} style={{ marginTop: 12 }}>校验本组</button>
      </Card>

      <Card>
        <h3>多对一：三个输入共同决定提交按钮禁用</h3>
        <div className="shiki-label">姓名</div>
        <input data-testid="linkage-many-name" className="shiki-input" value={manyName} onChange={(e) => setManyName(e.target.value)} />
        <div className="shiki-label">邮箱</div>
        <input data-testid="linkage-many-email" className="shiki-input" value={manyEmail} onChange={(e) => setManyEmail(e.target.value)} placeholder="name@example.com" />
        <label style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input data-testid="linkage-many-agree" type="checkbox" checked={manyAgree} onChange={(e) => setManyAgree(e.target.checked)} />
          我已阅读并同意协议
        </label>
        <button data-testid="linkage-many-submit" className="shiki-btn" type="button" disabled={!manyReady} style={{ marginTop: 12 }}>提交</button>
        <p data-testid="linkage-many-hint" className="shiki-muted">
          {manyReady ? '三项都满足，按钮可用。' : '姓名、合法邮箱、勾选协议三项缺一不可，按钮保持禁用。'}
        </p>
      </Card>

      <Card>
        <h3>多对多：迷你 SKU（颜色 ↔ 配置双向过滤）</h3>
        <div className="shiki-label">颜色</div>
        <div className="shiki-options">
          {ALL_COLORS.map((c) => (
            <button
              key={c}
              data-testid={`linkage-sku-color-${COLOR_SLUG[c] ?? c}`}
              type="button"
              className="shiki-chip"
              data-selected={color === c ? 'true' : 'false'}
              onClick={() => changeColor(color === c ? undefined : c)}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="shiki-label">配置（可选范围随颜色变）</div>
        <div className="shiki-options">
          {ALL_CONFIGS.map((c) => {
            const avail = (available.config as string[]).includes(c);
            return (
              <button
                key={c}
                data-testid={`linkage-sku-config-${CONFIG_SLUG[c] ?? c}`}
                type="button"
                className="shiki-chip"
                data-selected={config === c ? 'true' : 'false'}
                disabled={!avail}
                onClick={() => changeConfig(config === c ? undefined : c)}
              >
                {c}
              </button>
            );
          })}
        </div>
        <p data-testid="linkage-sku-available-colors" className="shiki-muted">
          当前可选颜色：{(available.color as string[]).join('、') || '无'}
        </p>
        <p data-testid="linkage-sku-available-configs" className="shiki-muted">
          当前可选配置：{(available.config as string[]).join('、') || '无'}
        </p>
        <p data-testid="linkage-sku-price" className="shiki-muted">
          {sku ? `最终 SKU：${sku.id}，价格 ${sku.price}，库存 ${sku.stock}` : range ? `价格区间：${range.min}–${range.max}（选满颜色 + 配置才有唯一 SKU）` : '无合法组合'}
        </p>
        <button data-testid="linkage-sku-reset" className="shiki-btn" type="button" onClick={() => { setColor(undefined); setConfig(undefined); }}>重置 SKU 选择</button>
        <p className="shiki-muted">试试反向：先选“Max”，再看颜色只剩黑色、白色、红色中能配 Max 的；选“红色”后配置只剩 Pro / Max，基础版被置灰。</p>
      </Card>
    </div>
  );
}
