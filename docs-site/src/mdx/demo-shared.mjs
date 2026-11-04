/** Demo 围栏的公共判断与 id 生成（remark 版与 Sätteri 版插件共用）。 */

/** 判断 fence meta 是否带 preview / live 标记。 */
export const isDemoFence = (node) =>
  ['tsx', 'jsx'].includes(node.lang ?? '') && /(?:^|\s)(preview|live)(?:\s|$)/.test(node.meta ?? '')

/** 与 Vite 插件（shikiform-vite.mjs）共享的稳定 island 标识。 */
export const demoId = (filePath, index) =>
  `demo-${String(filePath).replace(/[^a-z\d_-]/gi, '-')}-${index}`
