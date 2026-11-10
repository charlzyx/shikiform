import { Button, ConfigProvider, Divider, Space } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { useState } from 'react'
import { CascaderPlusView } from '@shikiform/antd'
import { loadArea, loadAreaAll } from '../pro-data'

/** Pro.formily `CascaderPlus.tsx` demo: lazy / full tree, multiple, labelInValue, and echo of existing values. */
export function CascaderPlusPage() {
  return (
    <ConfigProvider locale={zhCN}>
      <main style={{ padding: 16, maxWidth: 720 }}>
        <h1>CascaderPlus</h1>
        <p>一个 loadData(path) 服务所有层级；已有值打开时逐级加载祖先，标签能反显。数据是本地模拟的省市区。</p>
        <Divider orientation="left">基本属性</Divider>
        <Basic />
        <Divider orientation="left">Lazy Load 反显</Divider>
        <Echo />
        <Divider orientation="left">Lazy Load &amp; labelInValue 反显</Divider>
        <EchoLabels />
      </main>
    </ConfigProvider>
  )
}

function Toggle({ on, onChange, yes, no, id }: { on: boolean; onChange: (on: boolean) => void; yes: string; no: string; id: string }) {
  return (
    <>
      <Button size="small" data-testid={`${id}-on`} type={on ? 'primary' : 'default'} onClick={() => onChange(true)}>
        {yes}
      </Button>
      <Button size="small" data-testid={`${id}-off`} type={!on ? 'primary' : 'default'} onClick={() => onChange(false)}>
        {no}
      </Button>
    </>
  )
}

function Basic() {
  const [value, setValue] = useState<unknown>([])
  const [mode, setMode] = useState({ all: false, multiple: false, labelInValue: false })
  const set = (patch: Partial<typeof mode>) => {
    setMode((prev) => ({ ...prev, ...patch }))
    setValue([])
  }
  return (
    <div>
      <Space wrap style={{ marginBottom: 10 }}>
        <Toggle id="all" on={mode.all} onChange={(all) => set({ all })} yes="全量加载" no="懒加载" />
        <Toggle id="multiple" on={mode.multiple} onChange={(multiple) => set({ multiple })} yes="多选" no="!多选" />
        <Toggle id="liv" on={mode.labelInValue} onChange={(labelInValue) => set({ labelInValue })} yes="labelInValue" no="!labelInValue" />
      </Space>
      <CascaderPlusView
        key={JSON.stringify(mode)}
        data-testid="basic"
        value={value}
        onChange={setValue}
        loadData={mode.all ? loadAreaAll : loadArea}
        multiple={mode.multiple}
        labelInValue={mode.labelInValue}
      />
      <pre data-testid="basic-value">{JSON.stringify(value)}</pre>
    </div>
  )
}

function Echo() {
  const [multiple, setMultiple] = useState(false)
  const [value, setValue] = useState<unknown>(['110000', '11000000', '110105'])
  const [many, setMany] = useState<unknown>([
    ['110000', '11000000', '110105'],
    ['410000', '410600', '410621'],
  ])
  return (
    <div>
      <Space style={{ marginBottom: 10 }}>
        <Toggle id="echo-multiple" on={multiple} onChange={setMultiple} yes="多选" no="!多选" />
      </Space>
      <CascaderPlusView key={String(multiple)} data-testid="echo" value={multiple ? many : value} multiple={multiple} onChange={multiple ? setMany : setValue} loadData={loadArea} />
      <pre data-testid="echo-value">{JSON.stringify(multiple ? many : value)}</pre>
    </div>
  )
}

function EchoLabels() {
  const [multiple, setMultiple] = useState(false)
  const [value, setValue] = useState<unknown>([
    { label: '北京市', value: '110000' },
    { label: '北京市', value: '11000000' },
    { label: '朝阳区', value: '110105' },
  ])
  const [many, setMany] = useState<unknown>([
    [
      { label: '北京市', value: '110000' },
      { label: '北京市', value: '11000000' },
      { label: '朝阳区', value: '110105' },
    ],
    [
      { label: '河南省', value: '410000' },
      { label: '鹤壁市', value: '410600' },
      { label: '浚县', value: '410621' },
    ],
  ])
  return (
    <div>
      <Space style={{ marginBottom: 10 }}>
        <Toggle id="labels-multiple" on={multiple} onChange={setMultiple} yes="多选" no="!多选" />
      </Space>
      <CascaderPlusView
        key={String(multiple)}
        data-testid="labels"
        value={multiple ? many : value}
        multiple={multiple}
        labelInValue
        onChange={multiple ? setMany : setValue}
        loadData={loadArea}
      />
      <pre data-testid="labels-value">{JSON.stringify(multiple ? many : value)}</pre>
    </div>
  )
}
