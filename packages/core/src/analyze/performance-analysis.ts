import type {
  PerformanceAuditReport,
  PerformanceFieldData,
  PerformanceFieldMetric,
  PerformanceMetric,
  PerformanceRating,
} from './performance-types.js'

type FieldMetricName = 'CLS' | 'INP' | 'LCP'

const FIELD_THRESHOLDS = {
  CLS: { good: 0.1, poor: 0.25, unit: 'score' },
  INP: { good: 200, poor: 500, unit: 'milliseconds' },
  LCP: { good: 2_500, poor: 4_000, unit: 'milliseconds' },
} as const

function numericP75(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function fieldMetric(
  name: FieldMetricName,
  rawMetric: unknown,
): PerformanceFieldMetric | undefined {
  const p75 = numericP75(
    (rawMetric as { percentiles?: { p75?: unknown } } | undefined)?.percentiles
      ?.p75,
  )
  if (p75 === undefined || p75 < 0) return undefined
  const threshold = FIELD_THRESHOLDS[name]
  return {
    p75,
    unit: threshold.unit,
    rating:
      p75 <= threshold.good
        ? 'good'
        : p75 <= threshold.poor
          ? 'needs-work'
          : 'poor',
  }
}

export function parseCruxFieldData(input: {
  record: {
    key?: { url?: string; origin?: string; formFactor?: string }
    collectionPeriod?: {
      firstDate?: { year?: number; month?: number; day?: number }
      lastDate?: { year?: number; month?: number; day?: number }
    }
    metrics?: Record<string, unknown>
  }
  requestedFormFactor: 'DESKTOP' | 'PHONE'
}): PerformanceFieldData {
  const rawMetrics = input.record.metrics ?? {}
  const metrics: PerformanceFieldData['metrics'] = {
    cumulativeLayoutShift: fieldMetric(
      'CLS',
      rawMetrics.cumulative_layout_shift,
    ),
    interactionToNextPaint: fieldMetric(
      'INP',
      rawMetrics.interaction_to_next_paint,
    ),
    largestContentfulPaint: fieldMetric(
      'LCP',
      rawMetrics.largest_contentful_paint,
    ),
  }
  const entries = [
    ['CLS', metrics.cumulativeLayoutShift],
    ['INP', metrics.interactionToNextPaint],
    ['LCP', metrics.largestContentfulPaint],
  ] as const
  const available = entries.filter((entry) => entry[1] !== undefined)
  const missingMetrics = entries
    .filter((entry) => entry[1] === undefined)
    .map((entry) => entry[0])
  const ratings = available.map((entry) => entry[1]?.rating)
  const assessment = missingMetrics.length
    ? 'incomplete'
    : ratings.includes('poor')
      ? 'poor'
      : ratings.includes('needs-work')
        ? 'needs-work'
        : 'good'
  return {
    source: 'crux',
    status: 'available',
    scope: input.record.key?.url ? 'url' : 'origin',
    formFactor: input.requestedFormFactor,
    url: input.record.key?.url,
    origin: input.record.key?.origin,
    collectionPeriod: {
      firstDate: dateValue(input.record.collectionPeriod?.firstDate),
      lastDate: dateValue(input.record.collectionPeriod?.lastDate),
    },
    metrics,
    rawMetrics,
    assessment: {
      status: assessment,
      availableMetrics: available.length,
      missingMetrics,
    },
  }
}

function dateValue(value?: {
  year?: number
  month?: number
  day?: number
}): string | undefined {
  if (!value?.year || !value.month || !value.day) return undefined
  return `${String(value.year).padStart(4, '0')}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`
}

export function labMetric(input: {
  audit?: {
    numericValue?: number
    displayValue?: string
    score?: number | null
  }
  rating?: (value: number) => PerformanceRating
}): PerformanceMetric | undefined {
  if (!input.audit) return undefined
  const value =
    typeof input.audit.numericValue === 'number' &&
    Number.isFinite(input.audit.numericValue)
      ? Math.round(input.audit.numericValue * 1_000) / 1_000
      : undefined
  return {
    value,
    displayValue: input.audit.displayValue,
    score:
      typeof input.audit.score === 'number' ? input.audit.score : undefined,
    rating:
      typeof input.audit.score === 'number'
        ? input.audit.score >= 0.9
          ? 'good'
          : input.audit.score >= 0.5
            ? 'needs-work'
            : 'poor'
        : value === undefined
          ? 'unknown'
          : input.rating?.(value),
    source: 'lighthouse-lab',
  }
}

export function ratingAt(
  value: number,
  good: number,
  poor: number,
): Exclude<PerformanceRating, 'unknown'> {
  return value <= good ? 'good' : value <= poor ? 'needs-work' : 'poor'
}

function metricAction(input: {
  title: string
  metric: string
  value: number
  display: string
  source: string
  action: string
}): PerformanceAuditReport['topActions'][number] {
  return {
    title: input.title,
    plainEnglish: `${input.metric} is ${input.display} (${input.source}).`,
    action: input.action,
    evidence: {
      metric: input.metric,
      value: input.value,
      source: input.source,
    },
  }
}

function needsReview(
  metric?: PerformanceMetric,
): metric is PerformanceMetric & {
  value: number
} {
  return (
    typeof metric?.value === 'number' &&
    (metric.rating === 'needs-work' || metric.rating === 'poor')
  )
}

export function performanceActions(
  report: Pick<PerformanceAuditReport, 'metrics'> &
    Partial<
      Pick<
        PerformanceAuditReport,
        'fallbackEvidence' | 'fieldData' | 'labDataStatus' | 'labInsights'
      >
    >,
): PerformanceAuditReport['topActions'] {
  const actions: PerformanceAuditReport['topActions'] = []
  if (report.fallbackEvidence?.blocked) {
    actions.push({
      title: 'Resolve crawl access first',
      plainEnglish:
        'The fallback fetch was blocked, so it cannot support a page performance conclusion.',
      action:
        'Check robots and local fetch access, then rerun Lighthouse before reviewing performance.',
      evidence: report.fallbackEvidence,
    })
    return actions
  }
  if (
    report.fallbackEvidence &&
    (report.fallbackEvidence.httpStatus < 200 ||
      report.fallbackEvidence.httpStatus >= 300)
  ) {
    actions.push({
      title: 'Fix the page response first',
      plainEnglish: `The fallback fetch returned HTTP ${report.fallbackEvidence.httpStatus}.`,
      action:
        'Resolve the HTTP response before drawing any performance conclusion for this URL.',
      evidence: report.fallbackEvidence,
    })
    return actions
  }

  const field = report.fieldData?.metrics
  const fieldLcp = field?.largestContentfulPaint
  if (fieldLcp && fieldLcp.rating !== 'good') {
    actions.push(
      metricAction({
        title: 'Improve the largest visible content',
        metric: 'LCP p75',
        value: fieldLcp.p75,
        display: `${fieldLcp.p75}ms`,
        source: `CrUX ${report.fieldData?.scope} ${report.fieldData?.formFactor}`,
        action:
          'Optimize the LCP resource and server path, then verify the change in field data.',
      }),
    )
  }
  const labLcp = report.metrics.largestContentfulPaint
  if (needsReview(labLcp) && (!fieldLcp || fieldLcp.rating === 'good')) {
    actions.push(
      metricAction({
        title: fieldLcp
          ? 'Investigate the current lab LCP regression'
          : 'Improve the largest visible content',
        metric: 'Lighthouse LCP',
        value: labLcp.value,
        display: labLcp.displayValue ?? `${labLcp.value}ms`,
        source: 'Lighthouse lab run',
        action:
          'Optimize the LCP resource, render path, and HTML delivery, then repeat controlled lab runs.',
      }),
    )
  }

  const fieldInp = field?.interactionToNextPaint
  if (fieldInp && fieldInp.rating !== 'good') {
    actions.push(
      metricAction({
        title: 'Improve interaction responsiveness',
        metric: 'INP p75',
        value: fieldInp.p75,
        display: `${fieldInp.p75}ms`,
        source: `CrUX ${report.fieldData?.scope} ${report.fieldData?.formFactor}`,
        action:
          'Reduce long interaction tasks and rendering work, then verify the change in field data.',
      }),
    )
  }
  const labTbt = report.metrics.totalBlockingTime
  if (needsReview(labTbt)) {
    actions.push(
      metricAction({
        title: 'Reduce main-thread blocking',
        metric: 'Lighthouse TBT',
        value: labTbt.value,
        display: labTbt.displayValue ?? `${labTbt.value}ms`,
        source: 'Lighthouse lab diagnostic, not field INP',
        action:
          'Defer non-critical JavaScript, split long tasks, and repeat controlled lab runs.',
      }),
    )
  }

  const fieldCls = field?.cumulativeLayoutShift
  if (fieldCls && fieldCls.rating !== 'good') {
    actions.push(
      metricAction({
        title: 'Reduce layout shifts',
        metric: 'CLS p75',
        value: fieldCls.p75,
        display: String(fieldCls.p75),
        source: `CrUX ${report.fieldData?.scope} ${report.fieldData?.formFactor}`,
        action:
          'Reserve stable layout space and identify shifts across the full page lifecycle.',
      }),
    )
  }
  const labCls = report.metrics.cumulativeLayoutShift
  if (needsReview(labCls) && (!fieldCls || fieldCls.rating === 'good')) {
    actions.push(
      metricAction({
        title: fieldCls
          ? 'Investigate the current lab layout shift'
          : 'Reduce layout shifts',
        metric: 'Lighthouse CLS',
        value: labCls.value,
        display: labCls.displayValue ?? String(labCls.value),
        source: 'Lighthouse lab run',
        action:
          'Reserve dimensions for images, ads, embeds, banners, and late-loading UI.',
      }),
    )
  }

  const serverResponseTime = report.metrics.serverResponseTime
  if (needsReview(serverResponseTime)) {
    actions.push(
      metricAction({
        title: 'Reduce Lighthouse server response time',
        metric: 'Lighthouse server response time',
        value: serverResponseTime.value,
        display:
          serverResponseTime.displayValue ?? `${serverResponseTime.value}ms`,
        source: 'Lighthouse lab diagnostic',
        action:
          'Check origin work and HTML caching, then validate with repeat lab runs and separate field TTFB data.',
      }),
    )
  }

  for (const insight of (report.labInsights ?? [])
    .filter((item) => (item.estimatedSavingsMs ?? 0) > 0)
    .slice(0, 3)) {
    actions.push({
      title: `Review Lighthouse insight: ${insight.title}`,
      plainEnglish: `Lighthouse estimates about ${Math.round(insight.estimatedSavingsMs ?? 0)}ms of potential savings for ${insight.title}.`,
      action:
        'Inspect the returned evidence, fix the measured bottleneck, and confirm it with repeat controlled lab runs.',
      evidence: {
        insightId: insight.id,
        estimatedSavingsMs: insight.estimatedSavingsMs,
      },
    })
  }

  if (
    !actions.length &&
    report.labDataStatus?.status === 'unavailable' &&
    !report.fieldData
  ) {
    actions.push({
      title: 'Collect performance evidence',
      plainEnglish:
        'No Lighthouse lab metrics or CrUX field Core Web Vitals were available.',
      action:
        'Restore the local Lighthouse browser runtime or configure CrUX, then rerun before making performance claims.',
    })
  }

  if (!actions.length) {
    actions.push({
      title: 'Keep monitoring performance',
      plainEnglish:
        'No measured lab or field metric crossed its review threshold.',
      action:
        'Re-run after deploys and avoid generalizing this single URL and measurement window to the whole site.',
    })
  }
  return actions
}
