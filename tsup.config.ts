import { defineConfig } from 'tsup'

const bundledPackages = [/^@seo\//, /^cheerio(?:\/|$)/]

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
    noExternal: bundledPackages,
    banner: {
      js: "import { createRequire as __seoCreateRequire } from 'node:module'; const require = __seoCreateRequire(import.meta.url);",
    },
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
    noExternal: bundledPackages,
    banner: {
      js: "#!/usr/bin/env node\nimport { createRequire as __seoCreateRequire } from 'node:module'; const require = __seoCreateRequire(import.meta.url);",
    },
  },
])
