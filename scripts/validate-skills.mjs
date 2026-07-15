import { readdir, readFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve } from 'node:path'
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
  // `help` is handled directly in index.ts, not the subCommands registry, but
  // the CLAUDE.md contract requires `seo help`, `seo help all`, and
  // `seo help <command>` to work, so it is a real command for validation.
  commands.add('help')
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
    [
      ...source.matchAll(
        /`((?:seo|gsc|google_analytics|search|semrush)_[a-z0-9_]+)`/g,
      ),
    ].map((match) => match[1]),
  )
}

function jobsTableReportTokens(source) {
  const start = source.indexOf('## Common jobs')
  if (start < 0) return new Set()
  const rest = source.slice(start + '## Common jobs'.length)
  const nextHeading = rest.search(/\n## /)
  const section = nextHeading < 0 ? rest : rest.slice(0, nextHeading)
  const tokens = new Set()
  for (const match of section.matchAll(/`([a-z][a-z0-9-]+)`/g)) {
    tokens.add(match[1])
  }
  return tokens
}

const packageJson = JSON.parse(await text('package.json'))
if (!packageJson.files?.includes('skills')) {
  fail('package.json: files must include skills')
}
if (!packageJson.files?.includes('evals')) {
  fail('package.json: files must include evals')
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

// The package ships exactly one skill: skills/seo. It is a router that names
// report ids for common jobs; per-report depth lives in the registry and is
// fetched at runtime through describe, so there is no per-report skill folder.
const skillName = 'seo'
const skillPath = `skills/${skillName}/SKILL.md`
const skillSource = await text(skillPath)

let metadata = {}
try {
  metadata = parseSkillFrontmatter(skillSource, skillPath)
} catch (error) {
  fail(
    error instanceof Error
      ? error.message
      : `${skillPath}: invalid frontmatter`,
  )
}
if (metadata.name !== skillName) {
  fail(`${skillPath}: name must be ${skillName}`)
}
if (!metadata.description || metadata.description.length < 40) {
  fail(`${skillPath}: description must explain the skill and its trigger`)
}

const skillWords = skillSource.match(/[A-Za-z0-9][A-Za-z0-9'/-]*/g)?.length ?? 0
if (skillWords < 300) {
  fail(
    `${skillPath}: the router skill needs at least 300 words of guidance; found ${skillWords}`,
  )
}

for (const tool of [
  'seo_list_reports',
  'seo_describe_report',
  'seo_run_report',
]) {
  if (!skillSource.includes(`\`${tool}\``)) {
    fail(`${skillPath}: missing MCP discovery tool ${tool}`)
  }
}

for (const command of documentedCliCommands(skillSource)) {
  if (!cliCommands.has(command)) {
    fail(`${skillPath}: unknown seo root command ${command}`)
  }
}
for (const tool of documentedMcpTools(skillSource)) {
  if (!mcpTools.has(tool)) {
    fail(`${skillPath}: unknown MCP tool ${tool}`)
  }
}
// Every backtick token in the Common jobs table must resolve to a registered
// report id or a real root command (the table mixes report ids with the `report`
// command). An unknown token means the jobs table drifted from the registry.
for (const token of jobsTableReportTokens(skillSource)) {
  if (!reportIds.has(token) && !cliCommands.has(token)) {
    fail(
      `${skillPath}: jobs table references unknown report id or command ${token}`,
    )
  }
}

const agentPath = `skills/${skillName}/agents/openai.yaml`
let agentSource
try {
  agentSource = await text(agentPath)
} catch {
  fail(`${agentPath}: missing agent interface metadata`)
}
if (agentSource) {
  for (const field of ['display_name', 'short_description', 'default_prompt']) {
    if (!new RegExp(`^\\s+${field}:\\s+"[^"]+"$`, 'm').test(agentSource)) {
      fail(`${agentPath}: missing quoted ${field}`)
    }
  }
  if (!agentSource.includes(`$${skillName}`)) {
    fail(`${agentPath}: default_prompt must invoke $${skillName}`)
  }
}

function evalBacktickCommands(source) {
  const commands = new Set()
  for (const match of source.matchAll(/`seo\s+([a-z][a-z0-9-]*)[^`]*`/g)) {
    commands.add(match[1])
  }
  return commands
}

function evalReportIds(source) {
  const ids = new Set()
  const patterns = [
    /reports (?:run|describe) ([a-z][a-z0-9-]+)/g,
    /report ids? ([a-z][a-z0-9-]+)/g,
    /`([a-z][a-z0-9-]+)` report\b/g,
    /"id"\s*:\s*"([a-z][a-z0-9-]+)"/g,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) ids.add(match[1])
  }
  return ids
}

// Evals live at the top level, one file per report id or job. Each targets a
// router-level behaviour, so `subject` names the report or job, not a skill.
const evalFiles = (await readdir(resolve(root, 'evals')))
  .filter((name) => name.endsWith('.json'))
  .sort()
if (evalFiles.length === 0) {
  fail('evals: no evals/*.json files found')
}
for (const file of evalFiles) {
  const evalPath = `evals/${file}`
  const subject = basename(file, '.json')
  let doc
  try {
    doc = JSON.parse(await text(evalPath))
  } catch (error) {
    fail(
      `${evalPath}: invalid JSON (${error instanceof Error ? error.message : 'parse error'})`,
    )
    continue
  }

  if (doc.subject !== subject) {
    fail(`${evalPath}: subject must match its filename`)
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

const forbidden = [
  { pattern: /audits\.run/i, label: 'Audits.run reference' },
  {
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    label: 'email address',
  },
  { pattern: /<package-name>/i, label: 'package placeholder' },
  { pattern: /@seo\//, label: 'private package reference' },
]
const publicFiles = [
  'skills/README.md',
  'evals/README.md',
  '.claude-plugin/plugin.json',
  ...(await sourceFiles(resolve(root, 'skills'))).map((path) =>
    relative(root, path),
  ),
  ...evalFiles.map((file) => `evals/${file}`),
]
for (const path of publicFiles) {
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
  `Skill validation passed for the seo skill, ${evalFiles.length} eval files, and ${reportIds.size} report ids.\n`,
)
