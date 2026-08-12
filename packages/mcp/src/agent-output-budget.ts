import { agentActionsView } from '@seo/core'

export const AGENT_STRUCTURED_OUTPUT_MAX_BYTES = 96 * 1024

type Omission = {
  path: string
  kind: 'array' | 'string' | 'field'
  available?: number
  returned?: number
}

type CompactOptions = {
  arrayLimit: number
  stringLimit: number
  preserveAgentContract: boolean
}

function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value))
}

function setReturnedBytes(value: {
  outputBudget: { returnedBytes: number }
}): number {
  let measured = jsonBytes(value)
  while (value.outputBudget.returnedBytes !== measured) {
    value.outputBudget.returnedBytes = measured
    measured = jsonBytes(value)
  }
  return measured
}

function compactValue(
  value: unknown,
  path: string,
  options: CompactOptions,
  omissions: Omission[],
): unknown {
  if (typeof value === 'string') {
    if (value.length <= options.stringLimit) return value
    omissions.push({
      path,
      kind: 'string',
      available: value.length,
      returned: options.stringLimit,
    })
    return `${value.slice(0, Math.max(1, options.stringLimit - 3)).trimEnd()}...`
  }
  if (Array.isArray(value)) {
    if (value.length > options.arrayLimit) {
      omissions.push({
        path,
        kind: 'array',
        available: value.length,
        returned: options.arrayLimit,
      })
    }
    return value
      .slice(0, options.arrayLimit)
      .map((item, index) =>
        compactValue(item, `${path}[${index}]`, options, omissions),
      )
  }
  if (!value || typeof value !== 'object') return value
  const compact: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const itemPath = path ? `${path}.${key}` : key
    if (
      !path &&
      options.preserveAgentContract &&
      (key === 'findings' || key === 'inventories')
    ) {
      compact[key] = item
      continue
    }
    if (key === 'markdown') {
      omissions.push({ path: itemPath, kind: 'field' })
      continue
    }
    compact[key] = compactValue(item, itemPath, options, omissions)
  }
  return compact
}

export function compactAgentWorkflowOutput(
  report: Record<string, unknown>,
  options: { maxBytes?: number } = {},
): Record<string, unknown> {
  const maxBytes = options.maxBytes ?? AGENT_STRUCTURED_OUTPUT_MAX_BYTES
  const prepared = report
  const findings = report.findings as
    | { schemaVersion?: unknown; scope?: unknown; items?: unknown }
    | undefined
  const preserveAgentContract =
    findings?.schemaVersion === 1 &&
    findings.scope === 'returned-report' &&
    Array.isArray(findings.items)
  const originalBytes = jsonBytes(prepared)
  const complete = {
    ...prepared,
    outputBudget: {
      schemaVersion: 1,
      maxBytes,
      originalBytes,
      returnedBytes: 0,
      truncated: false,
      omissions: [],
      omissionsTruncated: false,
      detail:
        'The complete structured report fits within the agent output budget.',
    },
  }
  if (setReturnedBytes(complete) <= maxBytes) {
    return complete
  }
  const attempts: CompactOptions[] = [
    { arrayLimit: 10, stringLimit: 4_000, preserveAgentContract },
    { arrayLimit: 5, stringLimit: 2_000, preserveAgentContract },
    { arrayLimit: 3, stringLimit: 1_000, preserveAgentContract },
    { arrayLimit: 1, stringLimit: 500, preserveAgentContract },
  ]

  for (const options of attempts) {
    const omissions: Omission[] = []
    const compact = compactValue(prepared, '', options, omissions) as Record<
      string,
      unknown
    >
    const result = {
      ...compact,
      outputBudget: {
        schemaVersion: 1,
        maxBytes,
        originalBytes,
        returnedBytes: 0,
        truncated: omissions.length > 0,
        arrayLimit: options.arrayLimit,
        stringLimit: options.stringLimit,
        omissions: omissions.slice(0, 100),
        omissionsTruncated: omissions.length > 100,
        detail:
          'Counts, provenance, caveats, and compact evidence are retained. Run the related focused report when more rows are needed.',
      },
    }
    const returnedBytes = setReturnedBytes(result)
    if (returnedBytes <= maxBytes) return result
  }

  // When the full report cannot fit, prefer the purpose-built action view
  // before shortening the findings or any retained inventory. Agent completion
  // data is more important than repeating the report body.
  const actions = agentActionsView(prepared)
  const fallback = {
    ...actions,
    outputBudget: {
      schemaVersion: 1,
      maxBytes,
      originalBytes,
      returnedBytes: 0,
      truncated: true,
      fallback: true,
      omissionsTruncated: false,
      omissions: [{ path: 'reportBody', kind: 'field' as const }],
      detail:
        'The detailed report exceeded the budget, so the complete findings and retained inventories are returned instead.',
    },
  }
  if (setReturnedBytes(fallback) <= maxBytes) {
    return fallback
  }
  throw new Error(
    `The complete findings and inventories exceed the ${maxBytes}-byte agent output budget. Run a focused report with a narrower bounded scope; actionable rows were not truncated.`,
  )
}
