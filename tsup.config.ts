import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'core/index': 'src/core/index.ts',
    'pro/index': 'src/pro/index.ts',
    'antd/index': 'src/antd/index.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  outDir: 'lib',
  sourcemap: true,
  // Public entry points must share React providers and core class identity.
  // Inlining each entry duplicates FormContext when root hooks meet antd UI.
  splitting: true,
  treeshake: true,
  external: ['react', 'react-dom', 'antd', 'dayjs', '@tanstack/react-virtual'],
  target: 'es2022',
})
