import { reportGuideOverridesAF } from './guide-overrides-a-f'
import { reportGuideOverridesIP } from './guide-overrides-i-p'
import { reportGuideOverridesQZ } from './guide-overrides-q-z'
import type {
  ReportGuideInput,
  ReportGuideOverride,
  ResolvedReportGuide,
} from './guide-types'
import type { ReportEditorial } from './types'

export type {
  ReportGuideInput,
  ReportGuideOverride,
  ReportGuideSeo,
  ResolvedReportGuide,
} from './guide-types'

// Human-facing report guidance stays separate from the runtime registry. Add
// entries here when a report needs a clearer lead, a concrete output contract,
// or search metadata. Runtime ids, schemas, and evidence semantics continue to
// come from ReportEditorial and the live MCP report registry.
export const reportGuideOverrides: Partial<
  Record<string, ReportGuideOverride>
> = {
  ...reportGuideOverridesAF,
  ...reportGuideOverridesIP,
  ...reportGuideOverridesQZ,
}

export function resolveReportGuide(
  report: ReportEditorial,
): ResolvedReportGuide {
  const override = reportGuideOverrides[report.id]
  const fallbackInputs = report.evidence.map((label) => ({ label })) as [
    ReportGuideInput,
    ...ReportGuideInput[],
  ]

  return {
    ...report,
    name: override?.name ?? report.name,
    summary: override?.summary ?? report.summary,
    lead: override?.lead ?? report.summary,
    inputs: override?.inputs ?? fallbackInputs,
    checks: override?.checks ?? report.methodology,
    returns: override?.returns ?? [
      'A structured JSON result with report status, source details, warnings, caveats, and limited evidence.',
      'The dates, limits, thresholds, and skipped work needed to judge what the result supports.',
    ],
    seo: override?.seo,
  }
}
