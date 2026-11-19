import { localize } from '../language'
import { useState } from 'react'
import { Button, CascaderPlusView, Divider, Space } from '../kit'
import { loadArea, loadAreaAll } from '../pro-data'

/** Pro.formily `CascaderPlus.tsx` demo: lazy / full tree, multiple, labelInValue, and echo of existing values. */
export function CascaderPlusPage() {
  return (
    <main style={{ maxWidth: 720 }}>
      <h1>CascaderPlus</h1>
      <p>{localize("一个 loadData(path) 服务所有层级；已有值打开时逐级加载祖先，标签能反显。数据是本地模拟的省市区。", "A single loadData(path) serves every level. Opening an existing selection loads its ancestors so the labels can be displayed. The example uses a local region dataset.")}</p>
      <Divider>{localize("基本属性", "Basic options")}</Divider>
      <Basic />
      <Divider>{localize("Lazy Load 反显", "Show a saved path")}</Divider>
      <Echo />
      <Divider>{localize("Lazy Load &amp; labelInValue 反显", "Show a saved labeled path")}</Divider>
      <EchoLabels />
    </main>
  )
}

function Toggle({ on, onChange, yes, no, id }: { on: boolean; onChange: (on: boolean) => void; yes: string; no: string; id: string }) {
  return (
    <>
      <Button size="sm" data-testid={`${id}-on`} variant={on ? 'primary' : 'default'} onClick={() => onChange(true)}>
        {yes}
      </Button>
      <Button size="sm" data-testid={`${id}-off`} variant={!on ? 'primary' : 'default'} onClick={() => onChange(false)}>
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
        <Toggle id="all" on={mode.all} onChange={(all) => set({ all })} yes={localize("全量加载", "Load all")} no={localize("懒加载", "Lazy load")} />
        <Toggle id="multiple" on={mode.multiple} onChange={(multiple) => set({ multiple })} yes={localize("多选", "Multiple")} no={localize("!多选", "Single")} />
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
        <Toggle id="echo-multiple" on={multiple} onChange={setMultiple} yes={localize("多选", "Multiple")} no={localize("!多选", "Single")} />
      </Space>
      <CascaderPlusView key={String(multiple)} data-testid="echo" value={multiple ? many : value} multiple={multiple} onChange={multiple ? setMany : setValue} loadData={loadArea} />
      <pre data-testid="echo-value">{JSON.stringify(multiple ? many : value)}</pre>
    </div>
  )
}

function EchoLabels() {
  const [multiple, setMultiple] = useState(false)
  const [value, setValue] = useState<unknown>([
    { label: localize("北京市", "Beijing"), value: '110000' },
    { label: localize("北京市", "Beijing"), value: '11000000' },
    { label: localize("朝阳区", "Chaoyang"), value: '110105' },
  ])
  const [many, setMany] = useState<unknown>([
    [
      { label: localize("北京市", "Beijing"), value: '110000' },
      { label: localize("北京市", "Beijing"), value: '11000000' },
      { label: localize("朝阳区", "Chaoyang"), value: '110105' },
    ],
    [
      { label: localize("河南省", "Henan"), value: '410000' },
      { label: localize("鹤壁市", "Hebi"), value: '410600' },
      { label: localize("浚县", "Xun County"), value: '410621' },
    ],
  ])
  return (
    <div>
      <Space style={{ marginBottom: 10 }}>
        <Toggle id="labels-multiple" on={multiple} onChange={setMultiple} yes={localize("多选", "Multiple")} no={localize("!多选", "Single")} />
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
