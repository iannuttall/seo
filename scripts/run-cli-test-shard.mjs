import { spawnSync } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

export function parseShard(value) {
  const match = /^(\d+)\/(\d+)$/.exec(value ?? '')
  if (!match) {
    throw new Error('CLI test shard must use the form <index>/<total>.')
  }

  const index = Number(match[1])
  const total = Number(match[2])
  if (index < 1 || total < 1 || index > total) {
    throw new Error('CLI test shard index must be within the shard total.')
  }
  return `${index}/${total}`
}

async function findTestFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return findTestFiles(path)
      return entry.isFile() && entry.name.endsWith('.test.js') ? [path] : []
    }),
  )
  return files.flat()
}

export async function cliShardFiles(directory = 'packages/cli/dist') {
  const files = await findTestFiles(directory)
  return files
    .filter((file) => relative(directory, file) !== 'help.test.js')
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
}

async function main() {
  const shard = parseShard(process.argv[2])
  const files = await cliShardFiles()
  if (files.length === 0) throw new Error('No CLI test files were found.')

  const result = spawnSync(
    process.execPath,
    ['--test', `--test-shard=${shard}`, ...files],
    { stdio: 'inherit' },
  )
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main()
}
