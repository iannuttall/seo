import { chmod, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { stdin } from 'node:process'
import { setEnvValue } from './tool-secret-file.mjs'

const appRoot = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(
  await readFile(resolve(appRoot, 'env-manifest.json'), 'utf8'),
)
const name = process.argv[2]
if (!manifest.requiredRemote?.includes(name)) {
  throw new Error('Pass one required production secret name.')
}

let value = ''
stdin.setEncoding('utf8')
for await (const chunk of stdin) value += chunk
value = value.trim()
if (!value) throw new Error(`No value supplied for ${name}.`)

const targets = new Set([resolve(appRoot, '.dev.vars.production')])
const conductorRoot = process.env.CONDUCTOR_ROOT_PATH
if (conductorRoot) {
  targets.add(resolve(conductorRoot, 'apps/web/.dev.vars.production'))
}

for (const target of targets) {
  const source = await readFile(target, 'utf8')
  await writeFile(target, setEnvValue(source, name, value), { mode: 0o600 })
  await chmod(target, 0o600)
}

console.log(`Stored ${name} in ${targets.size} local production secret files.`)
