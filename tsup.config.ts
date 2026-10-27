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
  splitting: false,
  treeshake: true,
  external: ['react', 'react-dom', 'antd', '@tanstack/react-virtual'],
  target: 'es2022',
})
