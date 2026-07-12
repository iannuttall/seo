import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSkillFrontmatter } from './skill-frontmatter.mjs'

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
const overrideSource = reportRegistrySource.match(
  /const REPORT_ID_OVERRIDES = \{([\s\S]*?)\n\} as const/,
)?.[1]
const reportIdOverrides = new Map(
  [
    ...(overrideSource ?? '').matchAll(
      /(?:'([^']+)'|([a-z][a-z0-9-]*)):\s*'([^']+)'/g,
    ),
  ].map((match) => [match[1] ?? match[2], match[3]]),
)
const reportIds = new Set(
  [...reportRegistrySource.matchAll(/'seo_([a-z0-9_]+)'/g)].map((match) => {
    const internalId = match[1].replaceAll('_', '-')
    return reportIdOverrides.get(internalId) ?? internalId
  }),
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
  const words = source.match(/[A-Za-z0-9][A-Za-z0-9'/-]*/g)?.length ?? 0
  if (words < 200) {
    fail(
      `skills/${reportId}/SKILL.md: report skills need at least 200 words of specific guidance; found ${words}`,
    )
  }
  if (!source.includes(`seo reports describe ${reportId} --json`)) {
    fail(
      `skills/${reportId}/SKILL.md: missing schema discovery command for ${reportId}`,
    )
  }
  if (!source.includes(`seo reports run ${reportId} --params`)) {
    fail(
      `skills/${reportId}/SKILL.md: missing schema-backed run command for ${reportId}`,
    )
  }
}

for (const skillName of skillEntries) {
  const path = `skills/${skillName}/SKILL.md`
  const source = await text(path)
  let metadata = {}
  try {
    metadata = parseSkillFrontmatter(source, path)
  } catch (error) {
    fail(
      error instanceof Error ? error.message : `${path}: invalid frontmatter`,
    )
  }

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

function evalBacktickCommands(text) {
  const commands = new Set()
  for (const match of text.matchAll(/`seo\s+([a-z][a-z0-9-]*)[^`]*`/g)) {
    commands.add(match[1])
  }
  return commands
}

function evalReportIds(text) {
  const ids = new Set()
  const patterns = [
    /reports (?:run|describe) ([a-z][a-z0-9-]+)/g,
    /report ids? ([a-z][a-z0-9-]+)/g,
    /`([a-z][a-z0-9-]+)` report\b/g,
    /"id"\s*:\s*"([a-z][a-z0-9-]+)"/g,
  ]
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) ids.add(match[1])
  }
  return ids
}

// Evals are optional per skill. Only flagship skills ship them today, but any
// evals.json that exists must be structurally valid and cite real commands and
// report ids so a stale example fails the gate.
for (const skillName of skillEntries) {
  const evalPath = `skills/${skillName}/evals/evals.json`
  let raw
  try {
    raw = await text(evalPath)
  } catch {
    continue
  }

  let doc
  try {
    doc = JSON.parse(raw)
  } catch (error) {
    fail(
      `${evalPath}: invalid JSON (${error instanceof Error ? error.message : 'parse error'})`,
    )
    continue
  }

  if (doc.skill_name !== skillName) {
    fail(`${evalPath}: skill_name must match its folder`)
  }
  if (!Array.isArray(doc.evals) || doc.evals.length === 0) {
    fail(`${evalPath}: evals must be a non-empty array`)
    continue
  }

  const seenIds = new Set()
  for (const item of doc.evals) {
    const label = `${evalPath} eval ${item?.id ?? '?'}`
    if (!Number.isInteger(item?.id)) {
      fail(`${label}: id must be an integer`)
    } else if (seenIds.has(item.id)) {
      fail(`${label}: duplicate id`)
    } else {
      seenIds.add(item.id)
    }
    if (typeof item?.prompt !== 'string' || item.prompt.trim().length === 0) {
      fail(`${label}: prompt must be a non-empty string`)
    }
    if (
      typeof item?.expected_output !== 'string' ||
      item.expected_output.trim().length === 0
    ) {
      fail(`${label}: expected_output must be a non-empty string`)
    }
    if (!Array.isArray(item?.assertions) || item.assertions.length === 0) {
      fail(`${label}: assertions must be a non-empty array`)
    } else if (
      item.assertions.some(
        (entry) => typeof entry !== 'string' || entry.trim().length === 0,
      )
    ) {
      fail(`${label}: every assertion must be a non-empty string`)
    }
    if (!Array.isArray(item?.files)) {
      fail(`${label}: files must be an array`)
    }

    const evalText = [
      item?.prompt,
      item?.expected_output,
      ...(Array.isArray(item?.assertions) ? item.assertions : []),
    ]
      .filter((value) => typeof value === 'string')
      .join('\n')
    for (const command of evalBacktickCommands(evalText)) {
      if (!cliCommands.has(command)) {
        fail(`${label}: unknown seo root command ${command}`)
      }
    }
    for (const reportId of evalReportIds(evalText)) {
      if (!reportIds.has(reportId)) {
        fail(`${label}: unknown report id ${reportId}`)
      }
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
