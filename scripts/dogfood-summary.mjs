import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const statuses = [
  ['passed', 'Passed'],
  ['warnings', 'Needs review'],
  ['failed', 'Failed'],
  ['unknown', 'Unknown'],
  ['information', 'Information'],
  ['notApplicable', 'Not applicable'],
]

function checksById(report) {
  return new Map((report.checks ?? []).map((check) => [check.id, check]))
}

function statusChanges(current, previous) {
  if (!previous) return []

  const previousChecks = checksById(previous)
  return (current.checks ?? [])
    .map((check) => {
      const before = previousChecks.get(check.id)?.status
      if (!before || before === check.status) return undefined
      return { before, check }
    })
    .filter(Boolean)
    .sort((left, right) => left.check.id.localeCompare(right.check.id))
}

export function renderDogfoodSummary(current, previous) {
  const lines = [
    '# seoskill.dev agent-readiness audit',
    '',
    `Audited ${current.url}. This report checks published evidence, not a composite score.`,
    '',
    '## Current result',
    '',
    '| Status | Count |',
    '| --- | ---: |',
    ...statuses.map(
      ([key, label]) => `| ${label} | ${current.summary?.[key] ?? 0} |`,
    ),
    '',
    '## Changes since the previous run',
    '',
  ]

  const changes = statusChanges(current, previous)
  if (!previous) {
    lines.push('No previous audit artifact was available for comparison.')
  } else if (changes.length === 0) {
    lines.push('No check changed status.')
  } else {
    for (const { before, check } of changes) {
      lines.push(`- \`${check.id}\`: ${before} to ${check.status}`)
    }
  }

  lines.push('', '## What still needs attention', '')
  const actions = (current.topActions ?? []).filter((item) =>
    ['fail', 'warning', 'unknown'].includes(item.status),
  )
  if (actions.length === 0) {
    lines.push('No failed, warning, or unknown checks remain.')
  } else {
    for (const action of actions) {
      lines.push(`- **${action.title}** (${action.status}): ${action.action}`)
    }
  }

  return `${lines.join('\n')}\n`
}

async function main() {
  const [currentPath, previousPath, outputPath] = process.argv.slice(2)
  if (!currentPath || !outputPath) {
    throw new Error(
      'Usage: node scripts/dogfood-summary.mjs <current.json> [previous.json] <output.md>',
    )
  }

  const current = JSON.parse(await readFile(currentPath, 'utf8'))
  const previous = previousPath
    ? JSON.parse(await readFile(previousPath, 'utf8'))
    : undefined
  await writeFile(outputPath, renderDogfoodSummary(current, previous), 'utf8')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main()
}
