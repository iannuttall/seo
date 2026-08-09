import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseEnv } from './tool-secret-file.mjs'

const appRoot = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(
  await readFile(resolve(appRoot, 'env-manifest.json'), 'utf8'),
)
const secretNames = manifest.requiredRemote
if (
  !Array.isArray(secretNames) ||
  secretNames.some((name) => typeof name !== 'string' || !name)
) {
  throw new Error('Invalid env-manifest.json.')
}

function wrangler(args, input) {
  return execFileSync('pnpm', ['exec', 'wrangler', ...args], {
    cwd: appRoot,
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'inherit'],
  })
}

const listed = JSON.parse(wrangler(['secret', 'list', '--format', 'json']))
const remoteNames = new Set(
  Array.isArray(listed)
    ? listed
        .map((entry) => entry?.name)
        .filter((name) => typeof name === 'string')
    : [],
)
const overwriteAll = process.argv.includes('--all')
const dryRun = process.argv.includes('--dry-run')
const onlyIndex = process.argv.indexOf('--only')
const onlyName = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : undefined
if (onlyName && !secretNames.includes(onlyName)) {
  throw new Error(`${onlyName} is not a required remote secret.`)
}
const namesToPublish = onlyName
  ? [onlyName]
  : overwriteAll
    ? secretNames
    : secretNames.filter((name) => !remoteNames.has(name))

if (namesToPublish.length === 0) {
  console.log('All required tool secrets already exist on seo-skill.')
  process.exit(0)
}

const sourcePath = resolve(appRoot, '.dev.vars.production')
const values = parseEnv(await readFile(sourcePath, 'utf8'))
const secrets = Object.fromEntries(
  namesToPublish.map((name) => {
    const value = values.get(name)
    if (!value || value.startsWith('replace-with-')) {
      throw new Error(`Missing ${name} in .dev.vars.production.`)
    }
    return [name, value]
  }),
)

if (
  'TOOL_QUOTA_HASH_KEY' in secrets &&
  (secrets.TOOL_QUOTA_HASH_KEY?.length ?? 0) < 32
) {
  throw new Error('TOOL_QUOTA_HASH_KEY must be at least 32 characters.')
}

if (dryRun) {
  for (const name of namesToPublish)
    console.log(`DRY would publish secret: ${name}`)
  process.exit(0)
}

wrangler(['secret', 'bulk'], JSON.stringify(secrets))
console.log(
  `Published ${namesToPublish.length} tool secret${namesToPublish.length === 1 ? '' : 's'} to seo-skill.`,
)
