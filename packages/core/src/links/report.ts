import { SeoError } from '../errors.js'
import type { LinkTargetContext } from './context.js'
import type {
  CollectedLinkEvidence,
  LinkEvidenceRow,
  LinkTargetCount,
} from './types.js'

const DEFAULT_OUTPUT_LIMIT = 100
const MAX_OUTPUT_LIMIT = 500
const MAX_TARGET_COUNTS = 100
const MAX_CONTEXT_ROWS = 100
const MAX_FINDINGS = 50
const MAX_STRUCTURED_DETAIL_ROWS =
  MAX_OUTPUT_LIMIT + MAX_TARGET_COUNTS + MAX_CONTEXT_ROWS + MAX_FINDINGS

function boundedLimit(value?: number): number {
  const limit = value ?? DEFAULT_OUTPUT_LIMIT
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_OUTPUT_LIMIT) {
    throw new SeoError(
      'INVALID_INPUT',
      `Link report limit must be between 1 and ${MAX_OUTPUT_LIMIT}.`,
    )
  }
  return limit
}

function targetCounts(rows: LinkEvidenceRow[]): LinkTargetCount[] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    counts.set(row.targetUrl, (counts.get(row.targetUrl) ?? 0) + 1)
  }
  return [...counts]
    .map(([targetUrl, observedLinks]) => ({ targetUrl, observedLinks }))
    .sort(
      (a, b) =>
        b.observedLinks - a.observedLinks ||
        (a.targetUrl < b.targetUrl ? -1 : a.targetUrl > b.targetUrl ? 1 : 0),
    )
}

export function linkEvidenceReport(input: {
  evidence: CollectedLinkEvidence
  limit?: number
  targetContext?: LinkTargetContext
}) {
  const limit = boundedLimit(input.limit)
  const rows = input.evidence.rows.slice(0, limit)
  const domains = new Set(input.evidence.rows.map((row) => row.sourceDomain))
  const observedTargets = targetCounts(input.evidence.rows)
  const counts = input.evidence.targetCounts.length
    ? input.evidence.targetCounts
    : observedTargets

  const providerEvidence = input.evidence.externalProvider
    ? {
        summary: input.evidence.externalProvider.summary,
        backlinks: {
          ...input.evidence.externalProvider.backlinks,
          data: {
            target: input.evidence.externalProvider.backlinks.data.target,
            mode: input.evidence.externalProvider.backlinks.data.mode,
            totalRows: input.evidence.externalProvider.backlinks.data.totalRows,
            retainedRows:
              input.evidence.externalProvider.backlinks.data.rows.length,
          },
        },
      }
    : null
  const targetCountsOutput = counts.slice(0, MAX_TARGET_COUNTS)
  const contextRows = input.targetContext?.rows.slice(0, MAX_CONTEXT_ROWS) ?? []
  const findings = input.targetContext?.findings.slice(0, MAX_FINDINGS) ?? []
  const returnedDetailRows =
    rows.length +
    targetCountsOutput.length +
    contextRows.length +
    findings.length

  return {
    schemaVersion: 2 as const,
    generatedAt: new Date().toISOString(),
    dataStatus:
      input.evidence.provenance.completeness === 'complete'
        ? ('complete' as const)
        : ('partial' as const),
    summary: {
      observedLinks: input.evidence.rows.length,
      referringDomains: domains.size,
      targetPages: new Set(input.evidence.rows.map((row) => row.targetUrl))
        .size,
      providerTargetPages: counts.length,
    },
    providerSummary: providerEvidence?.summary.data ?? null,
    providerEvidence,
    provenance: input.evidence.provenance,
    selection: {
      availableRows: input.evidence.rows.length,
      returnedRows: rows.length,
      omittedRows: Math.max(0, input.evidence.rows.length - rows.length),
      limit,
    },
    outputBudget: {
      unit: 'structured-detail-rows' as const,
      limit: MAX_STRUCTURED_DETAIL_ROWS,
      returned: returnedDetailRows,
      omitted: Math.max(
        0,
        input.evidence.rows.length -
          rows.length +
          Math.max(0, counts.length - targetCountsOutput.length) +
          Math.max(
            0,
            (input.targetContext?.rows.length ?? 0) - contextRows.length,
          ) +
          Math.max(
            0,
            (input.targetContext?.findings.length ?? 0) - findings.length,
          ),
      ),
      sections: {
        links: { limit: MAX_OUTPUT_LIMIT, returned: rows.length },
        targetCounts: {
          limit: MAX_TARGET_COUNTS,
          returned: targetCountsOutput.length,
        },
        targetContext: {
          limit: MAX_CONTEXT_ROWS,
          returned: contextRows.length,
        },
        findings: { limit: MAX_FINDINGS, returned: findings.length },
      },
    },
    targetCounts: targetCountsOutput,
    links: rows,
    targetContext: input.targetContext
      ? { ...input.targetContext, rows: contextRows, findings }
      : null,
    findings,
    warnings: [
      ...input.evidence.warnings,
      ...(input.targetContext?.warnings ?? []),
    ],
    caveats: [
      'This is bounded provider or imported evidence, not a complete backlink index.',
      'A missing link is not proof that no link exists, and an observed link is not a quality or ranking verdict.',
      'Referring-domain counts describe the retained rows only.',
      ...(providerEvidence
        ? [
            'Provider profile counts describe its current index. The representative link rows are a separate bounded sample.',
            'Provider rank and spam metrics keep their provider names and scales. They are context, not ranking factors or universal authority scores.',
          ]
        : []),
      ...(input.targetContext
        ? [
            'Search Console page rows are retained first-party evidence. Missing or capped rows are never treated as zero.',
            'Saved crawl findings describe the recorded crawl time. Verify the live target before changing it.',
          ]
        : []),
    ],
  }
}
