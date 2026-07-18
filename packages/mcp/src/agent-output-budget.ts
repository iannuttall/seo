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
): Record<string, unknown> {
  const originalBytes = jsonBytes(report)
  const attempts: CompactOptions[] = [
    { arrayLimit: 10, stringLimit: 4_000 },
    { arrayLimit: 5, stringLimit: 2_000 },
    { arrayLimit: 3, stringLimit: 1_000 },
    { arrayLimit: 1, stringLimit: 500 },
  ]

  for (const options of attempts) {
    const omissions: Omission[] = []
    const compact = compactValue(report, '', options, omissions) as Record<
      string,
      unknown
    >
    const result = {
      ...compact,
      outputBudget: {
        schemaVersion: 1,
        maxBytes: AGENT_STRUCTURED_OUTPUT_MAX_BYTES,
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
    if (returnedBytes <= AGENT_STRUCTURED_OUTPUT_MAX_BYTES) return result
  }

  const fallbackOmissions: Omission[] = []
  const fallbackOutput = report.output as Record<string, unknown> | undefined
  const fallbackEvidenceSource = Object.fromEntries(
    Object.entries({
      provenance: report.provenance ?? fallbackOutput?.provenance,
      caveats: report.caveats ?? fallbackOutput?.caveats,
      warnings: report.warnings ?? fallbackOutput?.warnings,
      selection: report.selection ?? fallbackOutput?.selection,
      totals: report.totals ?? fallbackOutput?.totals,
    }).filter(([, value]) => value !== undefined),
  )
  const retainedEvidence = compactValue(
    fallbackEvidenceSource,
    'retainedEvidence',
    { arrayLimit: 10, stringLimit: 2_000 },
    fallbackOmissions,
  )
  const fallback = {
    workflow: report.workflow,
    site: report.site,
    generatedAt: report.generatedAt,
    summary: report.summary,
    steps: report.steps,
    actions: Array.isArray(report.actions) ? report.actions.slice(0, 5) : [],
    output: {
      dataStatus:
        (report.output as { dataStatus?: unknown } | undefined)?.dataStatus ??
        'partial',
      detail:
        'The detailed workflow exceeded the agent output budget. Run the related focused reports for section evidence.',
    },
    retainedEvidence,
    outputBudget: {
      schemaVersion: 1,
      maxBytes: AGENT_STRUCTURED_OUTPUT_MAX_BYTES,
      originalBytes,
      returnedBytes: 0,
      truncated: true,
      fallback: true,
      omissions: [
        { path: 'output', kind: 'field' as const },
        ...fallbackOmissions.slice(0, 99),
      ],
    },
  }
  setReturnedBytes(fallback)
  return fallback
}
