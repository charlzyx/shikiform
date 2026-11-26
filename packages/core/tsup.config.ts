import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/internal.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  outDir: 'dist',
  sourcemap: true,
  splitting: true,
  treeshake: true,
  external: [/^@shikiform\//],
  target: 'es2019',
  tsconfig: 'tsconfig.json',
})
