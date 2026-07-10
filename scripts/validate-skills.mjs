import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []

function fail(message) {
  failures.push(message)
}

async function text(path) {
  return readFile(resolve(root, path), 'utf8')
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)))
    else files.push(path)
  }
  return files
}

function frontmatter(source, path) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n/)
  if (!match) {
    fail(`${path}: missing YAML frontmatter`)
    return {}
  }

  const values = {}
  for (const line of match[1].split('\n')) {
    const field = line.match(/^([a-z]+):\s+(.+)$/)
    if (!field) {
      fail(`${path}: unsupported frontmatter line ${JSON.stringify(line)}`)
      continue
    }
    values[field[1]] = field[2]
  }

  const keys = Object.keys(values).sort()
  if (keys.join(',') !== 'description,name') {
    fail(`${path}: frontmatter must contain only name and description`)
  }
  return values
}

function rootCommands(source) {
  const start = source.indexOf('  subCommands: {')
  const end = source.indexOf('\n  },\n  run:', start)
  if (start < 0 || end < 0) {
    fail('packages/cli/src/index.ts: could not locate root command registry')
    return new Set()
  }

  const commands = new Set()
  const registry = source.slice(start, end)
  for (const match of registry.matchAll(
    /^\s*(?:'([^']+)'|([a-z][a-z0-9-]*)):\s*[A-Za-z]/gm,
  )) {
    commands.add(match[1] ?? match[2])
  }
  return commands
}

function documentedCliCommands(source) {
  const commands = new Set()
  for (const match of source.matchAll(/^\s*seo\s+([a-z][a-z0-9-]*)\b/gm)) {
    commands.add(match[1])
  }
  for (const match of source.matchAll(/`seo\s+([a-z][a-z0-9-]*)[^`]*`/g)) {
    commands.add(match[1])
  }
  return commands
}

function documentedMcpTools(source) {
  return new Set(
    [...source.matchAll(/`((?:seo|gsc|ga4|search|semrush)_[a-z0-9_]+)`/g)].map(
      (match) => match[1],
    ),
  )
}

const packageJson = JSON.parse(await text('package.json'))
if (!packageJson.files?.includes('skills')) {
  fail('package.json: files must include skills')
}

const plugin = JSON.parse(await text('.claude-plugin/plugin.json'))
if (plugin.version !== packageJson.version) {
  fail('.claude-plugin/plugin.json: version must match package.json')
}
if (plugin.license !== packageJson.license) {
  fail('.claude-plugin/plugin.json: license must match package.json')
}
const pluginServer = plugin.mcpServers?.seo
if (
  pluginServer?.command !== 'npx' ||
  JSON.stringify(pluginServer?.args) !==
    JSON.stringify(['-y', 'seo', 'mcp', 'serve'])
) {
  fail(
    '.claude-plugin/plugin.json: MCP command must run the unscoped seo package',
  )
}

const cliCommands = rootCommands(await text('packages/cli/src/index.ts'))
const reportRegistrySource = await text('packages/mcp/src/report-registry.ts')
const reportIds = new Set(
  [...reportRegistrySource.matchAll(/'seo_([a-z0-9_]+)'/g)].map((match) =>
    match[1].replaceAll('_', '-'),
  ),
)
const mcpSource = await text('packages/mcp/src/discovery-tools.ts')
const mcpTools = new Set(
  [...mcpSource.matchAll(/registerTool\(\s*'([^']+)'/g)].map(
    (match) => match[1],
  ),
)

const skillEntries = (
  await readdir(resolve(root, 'skills'), {
    withFileTypes: true,
  })
)
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()
const readme = await text('skills/README.md')
const forbidden = [
  { pattern: /audits\.run/i, label: 'Audits.run reference' },
  {
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    label: 'email address',
  },
  { pattern: /<package-name>/i, label: 'package placeholder' },
  { pattern: /@seo\//, label: 'private package reference' },
]

for (const reportId of reportIds) {
  if (!skillEntries.includes(reportId)) {
    fail(`skills/${reportId}: missing skill for report registry id`)
    continue
  }
  const source = await text(`skills/${reportId}/SKILL.md`)
  for (const tool of [
    'seo_list_reports',
    'seo_describe_report',
    'seo_run_report',
  ]) {
    if (!source.includes(`\`${tool}\``)) {
      fail(`skills/${reportId}/SKILL.md: missing compact MCP tool ${tool}`)
    }
  }
}

for (const skillName of skillEntries) {
  const path = `skills/${skillName}/SKILL.md`
  const source = await text(path)
  const metadata = frontmatter(source, path)

  if (metadata.name !== skillName) {
    fail(`${path}: name must match its folder`)
  }
  if (!metadata.description || metadata.description.length < 40) {
    fail(`${path}: description must explain the workflow and its trigger`)
  }
  if (source.split('\n').length > 500) {
    fail(`${path}: keep SKILL.md under 500 lines`)
  }
  if (!readme.includes(`\`${skillName}\``)) {
    fail(`skills/README.md: missing ${skillName} from the inventory`)
  }

  const agentPath = `skills/${skillName}/agents/openai.yaml`
  let agentSource
  try {
    agentSource = await text(agentPath)
  } catch {
    fail(`${agentPath}: missing agent interface metadata`)
  }
  if (agentSource) {
    for (const field of [
      'display_name',
      'short_description',
      'default_prompt',
    ]) {
      if (!new RegExp(`^\\s+${field}:\\s+"[^"]+"$`, 'm').test(agentSource)) {
        fail(`${agentPath}: missing quoted ${field}`)
      }
    }
    if (!agentSource.includes(`$${skillName}`)) {
      fail(`${agentPath}: default_prompt must invoke $${skillName}`)
    }
  }

  for (const command of documentedCliCommands(source)) {
    if (!cliCommands.has(command)) {
      fail(`${path}: unknown seo root command ${command}`)
    }
  }
  for (const tool of documentedMcpTools(source)) {
    if (!mcpTools.has(tool)) {
      fail(`${path}: unknown MCP tool ${tool}`)
    }
  }
}

const publicSkillFiles = [
  'skills/README.md',
  '.claude-plugin/plugin.json',
  ...(await sourceFiles(resolve(root, 'skills'))).map((path) =>
    relative(root, path),
  ),
]
for (const path of publicSkillFiles) {
  const source = await text(path)
  for (const rule of forbidden) {
    if (rule.pattern.test(source)) fail(`${path}: remove ${rule.label}`)
  }
}

if (failures.length > 0) {
  process.stderr.write(`Skill validation failed:\n${failures.join('\n')}\n`)
  process.exit(1)
}

process.stdout.write(
  `Skill validation passed for ${skillEntries.length} packaged skills and ${reportIds.size} report ids.\n`,
)
