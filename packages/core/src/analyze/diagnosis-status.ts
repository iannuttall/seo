import type {
  DiagnosePropertyReport,
  DiagnosisDataStatus,
  PartialDiagnosisReason,
} from './diagnose-property.js'

export function diagnosisPartialReasons(
  report: Pick<
    DiagnosePropertyReport,
    'segments' | 'decay' | 'cannibalization' | 'strikingDistance' | 'quickWins'
  >,
): PartialDiagnosisReason[] {
  const segmentReasons = (
    ['page', 'query', 'device', 'country'] as const
  ).flatMap((dimension) => {
    const segment = report.segments[dimension]
    if (segment.dataStatus === 'complete') {
      return []
    }
    return [
      {
        section: `${dimension} movement segments`,
        reason: `${segment.summary.verdict} Inspect its retained-row source evidence and warnings.`,
      },
    ]
  })
  return [
    ...segmentReasons,
    ...(report.decay.dataStatus === 'partial'
      ? [
          {
            section: 'decay analysis',
            reason:
              'The decay comparison used incomplete source evidence; inspect its source completeness, warnings, and caveats.',
          },
        ]
      : []),
    ...(report.cannibalization.dataStatus === 'partial'
      ? [
          {
            section: 'cannibalisation analysis',
            reason:
              'The multi-URL query analysis used incomplete source evidence; inspect its source completeness and caveats.',
          },
        ]
      : []),
    ...(report.strikingDistance.source.possiblyTruncated
      ? [
          {
            section: 'striking-distance opportunities',
            reason:
              'The retained Search Console response reached its row cap, so additional candidates may exist.',
          },
        ]
      : []),
    ...(report.strikingDistance.verification.requested &&
    report.strikingDistance.verification.failed > 0
      ? [
          {
            section: 'striking-distance content verification',
            reason: `${report.strikingDistance.verification.failed} of ${report.strikingDistance.verification.attempted} attempted candidate verifications failed, so page evidence is incomplete.`,
          },
        ]
      : []),
    ...(report.quickWins.source.possiblyTruncated
      ? [
          {
            section: 'quick-win opportunities',
            reason:
              'The retained Search Console response reached its row cap, so benchmarks and candidates may be incomplete.',
          },
        ]
      : []),
    ...(report.quickWins.verification.requested &&
    report.quickWins.verification.failed > 0
      ? [
          {
            section: 'quick-win content verification',
            reason: `${report.quickWins.verification.failed} of ${report.quickWins.verification.attemptedRows} attempted candidate verifications failed, so page evidence is incomplete.`,
          },
        ]
      : []),
  ]
}

export function diagnosisDataStatus(input: {
  criticalStatuses: Array<'completed' | 'skipped'>
  skippedSections: number
  partialReasons: number
}): DiagnosisDataStatus {
  if (
    input.criticalStatuses.length > 0 &&
    input.criticalStatuses.every((status) => status === 'skipped')
  ) {
    return 'unavailable'
  }
  return input.skippedSections || input.partialReasons ? 'partial' : 'complete'
}
