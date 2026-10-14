// Guards the hosted entry. The hosted MCP bundles `src/hosted.ts` into a
// Cloudflare Worker, so this entry must never reach Node builtins or the
// local token, cache, fetch, browser and extraction packages.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { createRequire, isBuiltin } from 'node:module'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const FORBIDDEN_PACKAGES = new Set([
  'libsql',
  'undici',
  'playwright-core',
  'lighthouse',
  '@napi-rs/keyring',
  'proper-lockfile',
  'open',
  'pino',
  'cheerio',
  'linkedom',
  'defuddle',
])

type EsbuildMessage = { text: string }
type EsbuildResolveArgs = { path: string; importer: string; kind: string }
type EsbuildPluginBuild = {
  onResolve: (
    options: { filter: RegExp },
    callback: (
      args: EsbuildResolveArgs,
    ) => { external: true; path: string } | undefined,
  ) => void
}
type EsbuildApi = {
  build: (options: Record<string, unknown>) => Promise<{
    errors: EsbuildMessage[]
    metafile?: { inputs: Record<string, unknown> }
  }>
}

const coreRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const repoRoot = dirname(dirname(coreRoot))
const hostedEntry = join(coreRoot, 'src', 'hosted.ts')

function packageName(specifier: string): string {
  const parts = specifier.split('/')
  return specifier.startsWith('@')
    ? parts.slice(0, 2).join('/')
    : (parts[0] ?? '')
}

function compareVersions(left: string, right: string): number {
  const a = left.split('.').map(Number)
  const b = right.split('.').map(Number)
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0)
    if (difference) return difference
  }
  return 0
}

// esbuild is not a direct dependency. The Worker toolchain installs it in the
// workspace store, so resolve it there when plain resolution fails.
function esbuildEntry(): string {
  try {
    return createRequire(import.meta.url).resolve('esbuild')
  } catch {
    const store = join(repoRoot, 'node_modules', '.pnpm')
    const versions = existsSync(store)
      ? readdirSync(store)
          .map((entry) => /^esbuild@(\d+\.\d+\.\d+)$/.exec(entry)?.[1])
          .filter((version): version is string => Boolean(version))
          .sort(compareVersions)
      : []
    const latest = versions.at(-1)
    const entry = latest
      ? join(
          store,
          `esbuild@${latest}`,
          'node_modules',
          'esbuild',
          'lib',
          'main.js',
        )
      : undefined
    if (!entry || !existsSync(entry)) {
      throw new Error(
        'esbuild is not installed in the workspace. Run pnpm install before the hosted bundle check.',
      )
    }
    return entry
  }
}

async function bundleViolations(
  entry: { file: string } | { contents: string },
): Promise<string[]> {
  const esbuild = (await import(
    pathToFileURL(esbuildEntry()).href
  )) as EsbuildApi
  const violations: string[] = []
  const guard = {
    name: 'hosted-worker-guard',
    setup(build: EsbuildPluginBuild) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.path.startsWith('.') || args.path.startsWith('/')) {
          return undefined
        }
        if (isBuiltin(args.path)) {
          violations.push(`Node builtin ${args.path} from ${args.importer}`)
          return { external: true, path: args.path }
        }
        if (FORBIDDEN_PACKAGES.has(packageName(args.path))) {
          violations.push(
            `Node-only package ${args.path} from ${args.importer}`,
          )
          return { external: true, path: args.path }
        }
        return undefined
      })
    },
  }
  try {
    const result = await esbuild.build({
      ...('file' in entry
        ? { entryPoints: [entry.file] }
        : {
            stdin: {
              contents: entry.contents,
              loader: 'ts',
              resolveDir: join(coreRoot, 'src'),
              sourcefile: 'probe.ts',
            },
          }),
      bundle: true,
      format: 'esm',
      logLevel: 'silent',
      platform: 'neutral',
      plugins: [guard],
      write: false,
    })
    violations.push(...result.errors.map((error) => error.text))
  } catch (error) {
    const errors = (error as { errors?: EsbuildMessage[] }).errors
    if (!errors?.length) throw error
    violations.push(...errors.map((message) => message.text))
  }
  return violations
}

test('hosted entry bundles for a Worker without Node-only imports', async () => {
  assert.deepEqual(await bundleViolations({ file: hostedEntry }), [])
})

test('hosted bundle check reports Node builtins and Node-only packages', async () => {
  const violations = await bundleViolations({
    contents: [
      "import { readFileSync } from 'node:fs'",
      "import { fetch } from 'undici'",
      "import { load } from 'cheerio'",
      'export { fetch, load, readFileSync }',
    ].join('\n'),
  })
  assert.equal(violations.length, 3, violations.join('\n'))
  assert.match(violations.join('\n'), /node:fs/)
  assert.match(violations.join('\n'), /undici/)
  assert.match(violations.join('\n'), /cheerio/)
})

test('hosted bundle check reports unresolved imports', async () => {
  const violations = await bundleViolations({
    contents: "export * from './does-not-exist.js'",
  })
  assert.equal(violations.length, 1, violations.join('\n'))
  assert.match(violations[0] ?? '', /Could not resolve/)
})
