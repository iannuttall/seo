import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const roots = ['apps', 'packages', 'scripts']
const excludedDirs = new Set([
  '.turbo',
  '.wrangler',
  'coverage',
  'dist',
  'node_modules',
])
const extensions = new Set([
  '.cjs',
  '.css',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
])
const maxLines = Number(process.env.LOC_MAX_LINES ?? 1000)
const top = Number(process.env.LOC_TOP ?? 25)

function extension(path) {
  const match = /\.[^.]+$/.exec(path)
  return match?.[0] ?? ''
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!excludedDirs.has(entry.name)) {
        walk(join(dir, entry.name), files)
      }
      continue
    }

    const path = join(dir, entry.name)
    if (entry.isFile() && extensions.has(extension(path))) {
      files.push(path)
    }
  }
  return files
}

const files = roots
  .filter((root) => statSync(root, { throwIfNoEntry: false })?.isDirectory())
  .flatMap((root) => walk(root))
  .map((path) => ({
    path,
    lines: readFileSync(path, 'utf8').split('\n').length,
  }))
  .sort((a, b) => b.lines - a.lines)

for (const file of files.slice(0, top)) {
  process.stdout.write(`${String(file.lines).padStart(5)} ${file.path}\n`)
}

const oversized = files.filter((file) => file.lines > maxLines)
if (oversized.length) {
  process.stderr.write(
    `\n${oversized.length} file(s) exceed LOC_MAX_LINES=${maxLines}.\n`,
  )
  process.exit(1)
}
