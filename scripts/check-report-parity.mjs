import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { reportSurfaces } from './report-surface-catalog.mjs'

const root = new URL('..', import.meta.url).pathname

function readTree(dir) {
  return readdirSync(dir)
    .flatMap((entry) => {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) return readTree(path)
      return path.endsWith('.ts') ? [readFileSync(path, 'utf8')] : []
    })
    .join('\n')
}

function readSource(relativePath) {
  const path = join(root, relativePath)
  return statSync(path).isDirectory()
    ? readTree(path)
    : readFileSync(path, 'utf8')
}

const sourceCache = new Map()
function source(relativePath) {
  const cached = sourceCache.get(relativePath)
  if (cached) return cached
  const text = readSource(relativePath)
  sourceCache.set(relativePath, text)
  return text
}

function sourceList(paths) {
  return paths.map((path) => source(path)).join('\n')
}

function assertIncludes(failures, input) {
  if (!input.source.includes(input.marker)) {
    failures.push(`${input.id}: missing ${input.area} marker ${input.marker}`)
  }
}

function assertOptionIncludes(failures, input) {
  if (
    input.source.includes(input.marker) ||
    input.source.includes(`'${input.option}'`) ||
    input.source.includes(`"${input.option}"`)
  ) {
    return
  }
  failures.push(
    `${input.id}: missing ${input.area} marker ${input.marker} or shared option ${input.option}`,
  )
}

const coreSource = readTree(join(root, 'packages/core/src'))
const cliRegistrationSource = source('packages/cli/src/index.ts')
const failures = []

for (const surface of reportSurfaces) {
  assertIncludes(failures, {
    id: surface.id,
    area: 'core',
    source: coreSource,
    marker: surface.core,
  })
  assertIncludes(failures, {
    id: surface.id,
    area: 'cli',
    source: cliRegistrationSource,
    marker: surface.cli.marker,
  })
  assertIncludes(failures, {
    id: surface.id,
    area: 'mcp',
    source: source(surface.mcp.file),
    marker: surface.mcp.marker,
  })

  for (const option of surface.options ?? []) {
    assertOptionIncludes(failures, {
      id: surface.id,
      area: `cli option ${option.name}`,
      source: sourceList([
        surface.cli.file,
        ...(surface.cli.sharedFiles ?? []),
      ]),
      marker: option.cli,
      option: option.name,
    })
    assertOptionIncludes(failures, {
      id: surface.id,
      area: `mcp option ${option.name}`,
      source: sourceList([
        surface.mcp.file,
        ...(surface.mcp.sharedFiles ?? []),
      ]),
      marker: option.mcp,
      option: option.name,
    })
    if (option.core !== false) {
      assertIncludes(failures, {
        id: surface.id,
        area: `core option ${option.name}`,
        source: coreSource,
        marker: option.core,
      })
    }
  }
}

if (failures.length) {
  process.stderr.write(`Report parity check failed:\n${failures.join('\n')}\n`)
  process.exit(1)
}

process.stdout.write(
  `Report parity check passed for ${reportSurfaces.length} report surfaces.\n`,
)
