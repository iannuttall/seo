import { defineConfig } from 'tsup'

const internalPackages = [/^@seo\//]

export default defineConfig([
  {
    entry: {
      index: 'packages/core/src/index.ts',
      mcp: 'packages/mcp/src/index.ts',
    },
    format: ['esm'],
    platform: 'node',
    target: 'node22',
    dts: true,
    sourcemap: true,
    clean: true,
    noExternal: internalPackages,
  },
  {
    entry: { cli: 'packages/cli/src/index.ts' },
    format: ['esm'],
    platform: 'node',
    target: 'node22',
    dts: false,
    sourcemap: true,
    clean: false,
    minify: true,
    noExternal: internalPackages,
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
])
