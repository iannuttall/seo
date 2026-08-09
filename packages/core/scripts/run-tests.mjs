import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const TEST_ROOT_ENV = 'SEO_CORE_TEST_ROOT'
const TEST_PRELOAD_ENV = 'SEO_CORE_TEST_PRELOAD'
const testRoot = process.env[TEST_ROOT_ENV]

if (process.env[TEST_PRELOAD_ENV] === '1') {
  if (!testRoot)
    throw new Error(`${TEST_ROOT_ENV} is required in test workers.`)
  const processRoot = join(testRoot, String(process.pid))
  process.env.SEO_CONFIG_DIR = join(processRoot, 'config')
  process.env.SEO_CACHE_DIR = join(processRoot, 'cache')
} else {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'seo-core-tests-'))
  const runner = fileURLToPath(import.meta.url)

  try {
    const result = spawnSync(
      process.execPath,
      ['--import', runner, '--test', 'dist/**/*.test.js'],
      {
        cwd: dirname(dirname(runner)),
        env: {
          ...process.env,
          [TEST_PRELOAD_ENV]: '1',
          [TEST_ROOT_ENV]: temporaryRoot,
        },
        stdio: 'inherit',
      },
    )
    if (result.error) throw result.error
    process.exitCode = result.status ?? 1
  } finally {
    rmSync(temporaryRoot, { force: true, recursive: true })
  }
}
