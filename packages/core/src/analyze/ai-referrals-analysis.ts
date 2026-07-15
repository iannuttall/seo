import { SeoError } from '../errors.js'
import {
  AI_REFERRAL_SOURCES_VERSION,
  aiReferralSourceForValue,
} from './ai-referrals-sources.js'
import type {
  AiReferralMetrics,
  AiReferralQueryEvidence,
  AiReferralReport,
  AiReferralSourceDefinition,
} from './ai-referrals-types.js'

type SourceTotal = AiReferralMetrics & {
  definition: AiReferralSourceDefinition
  observedSessionSources: Set<string>
}

type AiReferralAnalysisInput = {
  property: string
  generatedAt: string
  range: AiReferralReport['range']
  maxRows: number
  resultLimit: number
  sourceRows: Array<Record<string, string>>
  detailRows: Array<Record<string, string>>
  totalUsers: number | null
  sourceDiscovery: AiReferralQueryEvidence
  detail: AiReferralQueryEvidence
  totalUsersEvidence: AiReferralQueryEvidence
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function metric(row: Record<string, string>, name: string): number {
  const value = row[name]
  const parsed = Number(value)
  if (
    value === undefined ||
    value.trim() === '' ||
    !Number.isInteger(parsed) ||
    parsed < 0
  ) {
    throw new SeoError(
      'PROVIDER_UNAVAILABLE',
      `Google Analytics returned an invalid ${name} value.`,
    )
  }
  return parsed
}

function dateValue(value: string | undefined): string {
  if (!value || !/^\d{8}$/.test(value)) {
    throw new SeoError(
      'PROVIDER_UNAVAILABLE',
      'Google Analytics returned an invalid date value.',
    )
  }
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
}

function addMetrics(
  target: AiReferralMetrics,
  source: AiReferralMetrics,
): void {
  target.sessions += source.sessions
  target.eventCount += source.eventCount
}

function emptyMetrics(): AiReferralMetrics {
  return { sessions: 0, eventCount: 0 }
}

function evidenceReasons(
  name: string,
  evidence: AiReferralQueryEvidence,
): string[] {
  if (evidence.status === 'complete' || evidence.status === 'skipped') return []
  return [`${name} evidence is ${evidence.status}.`, ...evidence.warnings]
}

export function analyzeAiReferralRows(
  input: AiReferralAnalysisInput,
): AiReferralReport {
  const sourceTotals = new Map<string, SourceTotal>()
  for (const row of input.sourceRows) {
    const definition = aiReferralSourceForValue(row.sessionSource ?? '')
    if (!definition) continue
    const total = sourceTotals.get(definition.id) ?? {
      definition,
      observedSessionSources: new Set<string>(),
      ...emptyMetrics(),
    }
    addMetrics(total, {
      sessions: metric(row, 'sessions'),
      eventCount: metric(row, 'eventCount'),
    })
    total.observedSessionSources.add(row.sessionSource ?? '')
    sourceTotals.set(definition.id, total)
  }

  const pageTotals = new Map<
    string,
    AiReferralMetrics & { sources: Map<string, number> }
  >()
  const dailyTotals = new Map<string, AiReferralMetrics>()
  const detailTotal = emptyMetrics()
  for (const row of input.detailRows) {
    const definition = aiReferralSourceForValue(row.sessionSource ?? '')
    if (!definition || !sourceTotals.has(definition.id)) {
      throw new SeoError(
        'PROVIDER_UNAVAILABLE',
        'Google Analytics detail rows contained an unexpected session source.',
      )
    }
    const metrics = {
      sessions: metric(row, 'sessions'),
      eventCount: metric(row, 'eventCount'),
    }
    addMetrics(detailTotal, metrics)

    const landingPage = row.landingPagePlusQueryString || '(not set)'
    const pageTotal = pageTotals.get(landingPage) ?? {
      ...emptyMetrics(),
      sources: new Map<string, number>(),
    }
    addMetrics(pageTotal, metrics)
    pageTotal.sources.set(
      definition.id,
      (pageTotal.sources.get(definition.id) ?? 0) + metrics.sessions,
    )
    pageTotals.set(landingPage, pageTotal)

    const date = dateValue(row.date)
    const dailyTotal = dailyTotals.get(date) ?? emptyMetrics()
    addMetrics(dailyTotal, metrics)
    dailyTotals.set(date, dailyTotal)
  }

  const total = [...sourceTotals.values()].reduce((sum, source) => {
    addMetrics(sum, source)
    return sum
  }, emptyMetrics())
  const detailMismatch =
    (input.detail.status === 'complete' || input.detail.status === 'partial') &&
    (detailTotal.sessions !== total.sessions ||
      detailTotal.eventCount !== total.eventCount)
  const timeZones = new Set(
    [
      input.sourceDiscovery.timeZone,
      input.detail.timeZone,
      input.totalUsersEvidence.timeZone,
    ].filter((value): value is string => Boolean(value)),
  )
  const partialReasons = [
    ...evidenceReasons('Source discovery', input.sourceDiscovery),
    ...evidenceReasons('Landing-page detail', input.detail),
    ...evidenceReasons('Total users', input.totalUsersEvidence),
    ...(detailMismatch
      ? [
          'Google Analytics detail totals differ from source-discovery totals; landing-page and daily breakdowns are incomplete.',
        ]
      : []),
    ...(timeZones.size > 1
      ? ['Google Analytics queries returned inconsistent property time zones.']
      : []),
  ]
  const dataStatus = partialReasons.length ? 'partial' : 'complete'
  const generalCaveat =
    'Google Analytics only attributes visits that arrive with a recognized session source; some AI visits appear as direct, unassigned, or another source.'
  const possiblyTruncated =
    input.sourceDiscovery.truncated ||
    input.detail.truncated ||
    input.totalUsersEvidence.truncated

  const allLandingPages = [...pageTotals.entries()]
    .map(([landingPage, metrics]) => {
      const topSourceId = [...metrics.sources.entries()].sort(
        (left, right) => right[1] - left[1] || compareText(left[0], right[0]),
      )[0]?.[0]
      const topSource = topSourceId
        ? sourceTotals.get(topSourceId)?.definition
        : undefined
      if (!topSource) {
        throw new SeoError(
          'PROVIDER_UNAVAILABLE',
          'Could not resolve the top AI referral source.',
        )
      }
      return {
        landingPage,
        sessions: metrics.sessions,
        eventCount: metrics.eventCount,
        totalUsers: null,
        topSource: topSource.label,
        topSourceDetails: { id: topSource.id, label: topSource.label },
      }
    })
    .sort(
      (left, right) =>
        right.sessions - left.sessions ||
        compareText(left.landingPage, right.landingPage),
    )
  const landingPages = allLandingPages.slice(0, input.resultLimit)
  const selection = {
    limit: input.resultLimit,
    retainedRows: allLandingPages.length,
    returnedRows: landingPages.length,
    omittedRows: Math.max(0, allLandingPages.length - landingPages.length),
  }

  return {
    schemaVersion: 3,
    property: input.property,
    generatedAt: input.generatedAt,
    dataStatus,
    range: input.range,
    methodology: {
      id: 'google-analytics-ai-referrals',
      version: 2,
      attributionDimension: 'sessionSource',
      sourceRulesVersion: AI_REFERRAL_SOURCES_VERSION,
    },
    dataSource: {
      provider: 'google-analytics',
      api: 'analyticsdata.v1beta.runReport',
      maxRows: input.maxRows,
      calls:
        input.sourceDiscovery.calls +
        input.detail.calls +
        input.totalUsersEvidence.calls,
      possiblyTruncated,
      sourceDiscovery: input.sourceDiscovery,
      detail: input.detail,
      totalUsers: input.totalUsersEvidence,
      partialReasons,
    },
    selection: { landingPages: selection },
    summary: {
      ...total,
      totalUsers: input.totalUsers,
      totalUsersStatus:
        input.totalUsers === null ? 'not-reported' : 'available',
      sources: sourceTotals.size,
      landingPages: pageTotals.size,
      verdict: total.sessions
        ? dataStatus === 'complete'
          ? 'Detected AI referral traffic in Google Analytics.'
          : 'Detected AI referral traffic; partial counts and breakdowns are lower bounds.'
        : dataStatus === 'complete'
          ? 'No sessions attributed to the known AI session-source rules were detected.'
          : 'No AI-attributed sessions were found in retained Google Analytics data; this partial report cannot establish absence.',
      caveat: generalCaveat,
    },
    sources: [...sourceTotals.values()]
      .map((source) => ({
        id: source.definition.id,
        label: source.definition.label,
        source: source.definition.label,
        observedSessionSources: [...source.observedSessionSources].sort(
          compareText,
        ),
        sessions: source.sessions,
        eventCount: source.eventCount,
        totalUsers: null,
        shareOfAiSessions: total.sessions
          ? source.sessions / total.sessions
          : 0,
        share: total.sessions ? source.sessions / total.sessions : 0,
      }))
      .sort(
        (left, right) =>
          right.sessions - left.sessions || compareText(left.id, right.id),
      ),
    landingPages,
    daily: [...dailyTotals.entries()]
      .map(([date, metrics]) => ({ date, ...metrics, totalUsers: null }))
      .sort((left, right) => compareText(left.date, right.date)),
    caveats: [
      generalCaveat,
      'Attribution uses Google Analytics sessionSource only; landing-page text, medium text, and event referrers are never treated as referral sources.',
      'Source totals come from a low-cardinality source query; landing-page and daily detail is queried separately for the exact observed source values.',
      'Total users come from a separate filtered aggregate when AI sources are observed and are never summed across report rows; complete zero-session evidence implies zero users without another query.',
      ...(selection.omittedRows > 0
        ? [
            `Landing-page output returns the ${selection.returnedRows} highest-session pages from ${selection.retainedRows} retained detail rows; ${selection.omittedRows} lower-ranked pages are omitted. Increase resultLimit to inspect more.`,
          ]
        : []),
      ...partialReasons,
    ],
  }
}
