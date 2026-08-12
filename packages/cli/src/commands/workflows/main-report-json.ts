import { type diagnosePropertyWorkflow, SeoError } from '@seo/core'

export type DiagnoseWorkflowReport = Awaited<
  ReturnType<typeof diagnosePropertyWorkflow>
>

export function compactMainReportJson(
  report: DiagnoseWorkflowReport,
  workflowName?: string,
) {
  const { narrative } = report.output
  const { diagnosis } = narrative

  return {
    ...report,
    ...(workflowName ? { workflow: workflowName } : {}),
    output: {
      narrative: {
        site: narrative.site,
        generatedAt: narrative.generatedAt,
        dataStatus: narrative.dataStatus,
        periodDays: narrative.periodDays,
        period: narrative.period,
        headline: narrative.headline,
        caveats: narrative.caveats,
        sections: narrative.sections,
        priorities: narrative.priorities,
        diagnosis: {
          site: diagnosis.site,
          generatedAt: diagnosis.generatedAt,
          dataStatus: diagnosis.dataStatus,
          summary: diagnosis.summary,
          skippedSections: diagnosis.skippedSections,
          partialReasons: diagnosis.partialReasons,
          priorities: diagnosis.priorities,
        },
      },
    },
  }
}

export function shellArg(value: string): string {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) {
    return value
  }
  return `'${value.replaceAll("'", "'\\''")}'`
}

export function siteForDirectUrl(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    throw new SeoError('INVALID_INPUT', 'Pass a valid absolute URL with --url.')
  }
}
