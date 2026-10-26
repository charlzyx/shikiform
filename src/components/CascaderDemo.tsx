// Wrapper so the MDX page does not pass a function as an island prop
// (Astro island props must be serializable). The loader lives here.
import { CascaderPlus } from '../pro/CascaderPlus';
import type { EnumOption } from '../core/enum';

async function loadChildren(parent: EnumOption | null): Promise<EnumOption[]> {
  if (parent === null) return [{ label: '华东', value: 'east' }, { label: '华北', value: 'north' }];
  if (parent.value === 'east') return [{ label: '上海', value: 'sh' }, { label: '杭州', value: 'hz' }];
  return [];
}

export default function CascaderDemo() {
  return <CascaderPlus loadChildren={loadChildren} />;
}
