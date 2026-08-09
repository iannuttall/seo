import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { invalidRequiredSecretNames, parseEnv } from './tool-secret-file.mjs'

const appRoot = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(
  readFileSync(resolve(appRoot, 'env-manifest.json'), 'utf8'),
)
const required = Array.isArray(manifest.requiredRemote)
  ? manifest.requiredRemote
  : []

if (process.argv.includes('--require-local')) {
  let localValues
  try {
    localValues = parseEnv(
      readFileSync(resolve(appRoot, '.dev.vars.production'), 'utf8'),
    )
  } catch (error) {
    console.error(
      error instanceof Error
        ? `Could not read .dev.vars.production: ${error.message}`
        : 'Could not read .dev.vars.production.',
    )
    process.exit(1)
  }

  const invalidLocal = invalidRequiredSecretNames(localValues, required)
  if (invalidLocal.length > 0) {
    console.error(
      `Missing required local production secrets: ${invalidLocal.join(', ')}`,
    )
    process.exit(1)
  }
}

let output
try {
  output = execFileSync(
    'pnpm',
    ['exec', 'wrangler', 'secret', 'list', '--format', 'json'],
    {
      cwd: appRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
} catch (error) {
  const detail = error?.stderr?.toString().trim()
  console.error(
    detail ||
      'Could not check remote Worker secrets. Run `pnpm --filter @seo/web exec wrangler login` and try again.',
  )
  process.exit(1)
}

let listed
try {
  listed = JSON.parse(output)
} catch {
  console.error(
    'Wrangler returned an invalid secret list. Update Wrangler and try again.',
  )
  process.exit(1)
}
const remote = new Set(
  Array.isArray(listed)
    ? listed
        .map((entry) => entry?.name)
        .filter((name) => typeof name === 'string')
    : [],
)
const missing = required.filter((name) => !remote.has(name))

if (missing.length > 0) {
  console.error(`Missing required remote Worker secrets: ${missing.join(', ')}`)
  process.exit(1)
}

console.log(`All ${required.length} required tool secrets exist on seo-skill.`)
