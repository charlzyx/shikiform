import { createElement, type ComponentType } from 'react'
import { createRoot, hydrateRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, type PropType, type Ref } from 'vue'
import { SiteThemeContext } from './theme'

/** Vue owns only the host node. React alone owns its descendants. */
export function createReactIsland(ssr: boolean, theme?: () => Ref<boolean>) { return defineComponent({
  name: 'ReactIsland',
  props: {
    component: { type: Function as PropType<ComponentType<any>>, required: true },
    reactProps: { type: Object as PropType<Record<string, unknown>>, default: () => ({}) },
    identifier: { type: String, required: true },
  },
  setup(props) {
    const host = ref<HTMLElement>()
    const isDark = theme?.() ?? ref(false)
    let root: Root | undefined
    const element = () => createElement(SiteThemeContext.Provider, { value: isDark.value }, createElement(props.component, props.reactProps))
    const options = () => ({ identifierPrefix: `${props.identifier}-` })
    onMounted(() => {
      if (!host.value) throw new Error('React island host missing')
      // Initial SSG visit has React HTML. A client route transition has an empty host.
      if (host.value.hasChildNodes()) root = hydrateRoot(host.value, element(), options())
      else {
        root = createRoot(host.value, options())
        // VitePress collects outline headings in the parent Vue mounted callback.
        // Commit React before that callback, including client-only route visits.
        flushSync(() => root!.render(element()))
      }
    })
    watch(() => [props.component, props.reactProps, isDark.value], () => { root?.render(element()) })
    onBeforeUnmount(() => { root?.unmount(); root = undefined })
    const view = (html?: string) => () => h('div', {
      ref: host, 'data-react-island': props.identifier,
      // Do not give Vue reactive children: it must not patch React-owned DOM.
      ...(html === undefined ? {} : { innerHTML: html }),
    })
    if (ssr) {
      return import('react-dom/server').then(({ renderToString }) => view(renderToString(element(), options())))
    }
    return view()
  },
}) }
