import { querySearchAnalytics } from '../../gsc/client.js'
import type { GscRow, Recommendation } from '../../types.js'
import { defaultDateRange } from '../shared.js'
import { insertLinkRecoverRun } from './link-recover-store.js'
import {
  type RedirectTraceIssue,
  type RedirectTraceReport,
  redirectTrace,
} from './redirect-trace.js'

export type LinkRecoverItem = {
  url: string
  finalUrl: string
  clicks: number
  impressions: number
  position: number
  issue: RedirectTraceIssue
  issues: RedirectTraceIssue[]
  severity: 'high' | 'medium' | 'low'
  trace: Pick<
    RedirectTraceReport,
    'summary' | 'chain' | 'finalPage' | 'warnings'
  >
  recommendation: Recommendation
}

export type LinkRecoverReport = {
  site: string
  generatedAt: string
  range: {
    startDate: string
    endDate: string
    days: number
  }
  summary: {
    checked: number
    recoverable: number
    high: number
    medium: number
    low: number
    clicksAtRisk: number
    impressionsAtRisk: number
  }
  items: LinkRecoverItem[]
  warnings: string[]
}

function primaryIssue(issues: RedirectTraceIssue[]): RedirectTraceIssue {
  const priority: RedirectTraceIssue[] = [
    'final-5xx',
    'final-4xx',
    'redirect-loop',
    'too-many-redirects',
    'non-indexable-final',
    'canonical-mismatch',
    'redirect-without-location',
  ]
  return (
    priority.find((issue) => issues.includes(issue)) ?? issues[0] ?? 'final-4xx'
  )
}

function issueSeverity(
  issue: RedirectTraceIssue,
  metrics: { clicks: number; impressions: number },
): 'high' | 'medium' | 'low' {
  if (issue === 'final-5xx' || issue === 'final-4xx') {
    return metrics.clicks >= 10 || metrics.impressions >= 500
      ? 'high'
      : 'medium'
  }
  if (issue === 'redirect-loop' || issue === 'too-many-redirects') {
    return 'high'
  }
  if (issue === 'non-indexable-final') {
    return metrics.clicks >= 5 || metrics.impressions >= 250 ? 'high' : 'medium'
  }
  return metrics.clicks >= 10 || metrics.impressions >= 500 ? 'medium' : 'low'
}

export function linkRecoverRecommendation(input: {
  issue: RedirectTraceIssue
  url: string
  finalUrl: string
  clicks: number
  impressions: number
}): Recommendation {
  const impactEstimate = `${Math.round(input.clicks).toLocaleString('en-GB')} clicks and ${Math.round(input.impressions).toLocaleString('en-GB')} impressions in the checked period.`

  if (input.issue === 'final-4xx') {
    return {
      principle: 'Search-value URLs should not resolve to dead pages.',
      evidenceRef: input.url,
      action:
        'This search-visible URL now lands on a dead page. Restore the page if it should exist, or add one direct 301 redirect to the closest live replacement.',
      effort: 'S',
      confidence: 'high',
      impactEstimate,
    }
  }

  if (input.issue === 'final-5xx') {
    return {
      principle: 'Server errors on search-visible URLs waste existing demand.',
      evidenceRef: input.url,
      action:
        'This search-visible URL ends in a server error. Fix the server response first, then rerun URL Inspection once it returns a stable 200 or an intentional 301.',
      effort: 'S',
      confidence: 'high',
      impactEstimate,
    }
  }

  if (
    input.issue === 'redirect-loop' ||
    input.issue === 'too-many-redirects' ||
    input.issue === 'redirect-without-location'
  ) {
    return {
      principle: 'Redirect chains must resolve cleanly to a crawlable target.',
      evidenceRef: input.url,
      action:
        'The redirect path is broken. Replace the chain with one direct 301 from the old URL to the intended live destination.',
      effort: 'M',
      confidence: 'high',
      impactEstimate,
    }
  }

  if (input.issue === 'non-indexable-final') {
    return {
      principle: 'Recovered search-value URLs need an indexable final target.',
      evidenceRef: input.finalUrl,
      action:
        'The final destination is not indexable. Remove accidental noindex/robots blocking, or redirect the old URL to an indexable equivalent.',
      effort: 'S',
      confidence: 'high',
      impactEstimate,
    }
  }

  return {
    principle:
      'Canonicals should reinforce the final URL selected by redirects.',
    evidenceRef: input.finalUrl,
    action:
      'The redirect target and canonical target disagree. Make the canonical match the final destination, or redirect the original URL directly to the canonical page.',
    effort: 'S',
    confidence: 'medium',
    impactEstimate,
  }
}

function rowMetrics(row: GscRow): {
  url: string
  clicks: number
  impressions: number
  position: number
} {
  return {
    url: row.keys[0] ?? '',
    clicks: row.clicks,
    impressions: row.impressions,
    position: row.position,
  }
}

export async function linkRecover(input: {
  site: string
  days?: number
  limit?: number
  minClicks?: number
  minImpressions?: number
  refresh?: boolean
  js?: boolean | 'auto'
}): Promise<LinkRecoverReport> {
  const days = input.days ?? 90
  const range = defaultDateRange(days)
  const result = await querySearchAnalytics(
    input.site,
    {
      ...range,
      dimensions: ['page'],
      type: 'web',
      dataState: 'final',
    },
    { refresh: input.refresh },
  )
  const minClicks = input.minClicks ?? 1
  const minImpressions = input.minImpressions ?? 100
  const candidates = result.rows
    .map(rowMetrics)
    .filter(
      (row) =>
        row.url &&
        (row.clicks >= minClicks || row.impressions >= minImpressions),
    )
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, input.limit ?? 50)

  const items: LinkRecoverItem[] = []
  const warnings: string[] = []

  for (const candidate of candidates) {
    const trace = await redirectTrace({
      url: candidate.url,
      refresh: input.refresh,
      js: input.js ?? 'auto',
    })
    warnings.push(...trace.warnings)
    if (!trace.summary.issues.length) continue

    const issue = primaryIssue(trace.summary.issues)
    const severity = issueSeverity(issue, candidate)
    items.push({
      url: candidate.url,
      finalUrl: trace.finalUrl,
      clicks: candidate.clicks,
      impressions: candidate.impressions,
      position: candidate.position,
      issue,
      issues: trace.summary.issues,
      severity,
      trace: {
        summary: trace.summary,
        chain: trace.chain,
        finalPage: trace.finalPage,
        warnings: trace.warnings,
      },
      recommendation: linkRecoverRecommendation({
        issue,
        url: candidate.url,
        finalUrl: trace.finalUrl,
        clicks: candidate.clicks,
        impressions: candidate.impressions,
      }),
    })
  }

  const report: LinkRecoverReport = {
    site: input.site,
    generatedAt: new Date().toISOString(),
    range: {
      ...range,
      days,
    },
    summary: {
      checked: candidates.length,
      recoverable: items.length,
      high: items.filter((item) => item.severity === 'high').length,
      medium: items.filter((item) => item.severity === 'medium').length,
      low: items.filter((item) => item.severity === 'low').length,
      clicksAtRisk: items.reduce((sum, item) => sum + item.clicks, 0),
      impressionsAtRisk: items.reduce((sum, item) => sum + item.impressions, 0),
    },
    items,
    warnings: [...new Set(warnings)].slice(0, 50),
  }
  insertLinkRecoverRun(report)
  return report
}
