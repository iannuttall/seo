import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    platform: 'node',
    target: 'node20',
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
    target: 'node20',
    bundle: true,
    removeNodeProtocol: false,
    dts: false,
    sourcemap: true,
    clean: false,
    minify: false,
  },
]);
