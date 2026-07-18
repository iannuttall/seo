import { SeoError } from '../errors.js'
import type {
  CollectedLinkEvidence,
  LinkEvidenceRow,
  LinkTargetCount,
} from './types.js'

const DEFAULT_OUTPUT_LIMIT = 100
const MAX_OUTPUT_LIMIT = 500

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
        a.targetUrl.localeCompare(b.targetUrl, 'en'),
    )
}

export function linkEvidenceReport(input: {
  evidence: CollectedLinkEvidence
  limit?: number
}) {
  const limit = boundedLimit(input.limit)
  const rows = input.evidence.rows.slice(0, limit)
  const domains = new Set(input.evidence.rows.map((row) => row.sourceDomain))
  const observedTargets = targetCounts(input.evidence.rows)
  const counts = input.evidence.targetCounts.length
    ? input.evidence.targetCounts
    : observedTargets

  return {
    schemaVersion: 1 as const,
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
    provenance: input.evidence.provenance,
    selection: {
      availableRows: input.evidence.rows.length,
      returnedRows: rows.length,
      omittedRows: Math.max(0, input.evidence.rows.length - rows.length),
      limit,
    },
    targetCounts: counts.slice(0, 100),
    links: rows,
    warnings: input.evidence.warnings,
    caveats: [
      'This is bounded provider or imported evidence, not a complete backlink index.',
      'A missing link is not proof that no link exists, and an observed link is not a quality or ranking verdict.',
      'Referring-domain counts describe the retained rows only.',
    ],
  }
}
