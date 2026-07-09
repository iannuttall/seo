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
      'src/diagnosis-tools.ts',
      'src/fetch-rate.ts',
      'src/opportunity-tools.ts',
      'src/report-options.ts',
      'src/report-tools/input.ts',
      'src/report-tools/second-page.ts',
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
