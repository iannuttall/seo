import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    platform: 'node',
    target: 'es2022',
    dts: true,
    sourcemap: true,
    clean: true,
  },
  {
    entry: [
      'src/crawler-tools.ts',
      'src/fetch-rate.ts',
      'src/tool-result.ts',
      'src/**/*.test.ts',
    ],
    format: ['esm'],
    platform: 'node',
    target: 'es2022',
    bundle: false,
    dts: false,
    sourcemap: true,
    clean: false,
  },
])
