import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  outDir: 'dist',
  sourcemap: true,
  splitting: true,
  treeshake: true,
  external: [/^@shikiform\//, 'react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'antd', 'dayjs', /^dayjs\//],
  target: 'es2022',
  tsconfig: 'tsconfig.json',
})
