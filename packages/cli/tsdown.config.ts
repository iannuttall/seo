import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    platform: 'node',
    target: 'node22',
    fixedExtension: false,
    dts: true,
    sourcemap: true,
    clean: true,
    minify: true,
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
  {
    entry: ['src/**/*.test.ts'],
    format: ['esm'],
    platform: 'node',
    target: 'node22',
    fixedExtension: false,
    dts: false,
    sourcemap: true,
    clean: false,
    minify: false,
  },
])
