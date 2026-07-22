import { defineConfig } from 'tsdown'

const bundledPackages = [
  /^@seo\//,
  /^@modelcontextprotocol\/sdk(?:\/|$)/,
  /^cheerio(?:\/|$)/,
]

export default defineConfig([
  {
    entry: {
      index: 'packages/core/src/index.ts',
      mcp: 'packages/mcp/src/index.ts',
    },
    format: ['esm'],
    platform: 'node',
    target: 'node22',
    fixedExtension: false,
    dts: true,
    sourcemap: true,
    clean: true,
    deps: {
      alwaysBundle: bundledPackages,
      neverBundle: ['playwright-core'],
      onlyBundle: false,
    },
    banner: {
      js: "import { createRequire as __seoCreateRequire } from 'node:module'; const require = __seoCreateRequire(import.meta.url);",
    },
  },
  {
    entry: { cli: 'packages/cli/src/index.ts' },
    format: ['esm'],
    platform: 'node',
    target: 'node22',
    fixedExtension: false,
    dts: false,
    sourcemap: true,
    clean: false,
    minify: true,
    deps: {
      alwaysBundle: bundledPackages,
      neverBundle: ['playwright-core'],
      onlyBundle: false,
    },
    banner: {
      js: "#!/usr/bin/env node\nimport { createRequire as __seoCreateRequire } from 'node:module'; const require = __seoCreateRequire(import.meta.url);",
    },
  },
])
