import { SeoError } from '../errors.js'
import { runGa4Report } from '../ga4/client.js'
import { analyzeAiReferralRows } from './ai-referrals-analysis.js'
import {
  type AiReferralQueryResult,
  fetchAiReferralRows,
  sessionSourceInListFilter,
} from './ai-referrals-query.js'
import { aiReferralSourceForValue } from './ai-referrals-sources.js'
import type {
  AiReferralQueryEvidence,
  AiReferralReport,
} from './ai-referrals-types.js'

export { analyzeAiReferralRows } from './ai-referrals-analysis.js'
export { sessionSourceInListFilter } from './ai-referrals-query.js'
export {
  AI_REFERRAL_SOURCES,
  AI_REFERRAL_SOURCES_VERSION,
  aiReferralSourceForValue,
} from './ai-referrals-sources.js'
export type * from './ai-referrals-types.js'

const DEFAULT_MAX_ROWS = 100_000
const MAX_ROWS = 100_000

type RunGa4Report = typeof runGa4Report

function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
}

function validRelativeDate(value: string): boolean {
  return (
    value === 'today' || value === 'yesterday' || /^\d+daysAgo$/.test(value)
  )
}

function reportRange(input: {
  startDate?: string
  endDate?: string
}): AiReferralReport['range'] {
  const startDate = input.startDate ?? '28daysAgo'
  const endDate = input.endDate ?? 'yesterday'
  const absolute = validIsoDate(startDate) && validIsoDate(endDate)
  const relative = validRelativeDate(startDate) && validRelativeDate(endDate)
  if (!absolute && !relative) {
    throw new SeoError(
      'INVALID_INPUT',
      'startDate and endDate must both be YYYY-MM-DD dates or GA4 relative dates such as 28daysAgo and yesterday.',
    )
  }
  if (absolute && startDate > endDate) {
    throw new SeoError(
      'INVALID_INPUT',
      'startDate must be on or before endDate.',
    )
  }
  return { startDate, endDate, kind: absolute ? 'absolute' : 'relative' }
}

function maxRows(input: { maxRows?: number; limit?: number }): number {
  if (
    input.maxRows !== undefined &&
    input.limit !== undefined &&
    input.maxRows !== input.limit
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      'Use maxRows or the legacy limit option, not both.',
    )
  }
  const value = input.maxRows ?? input.limit ?? DEFAULT_MAX_ROWS
  if (!Number.isInteger(value) || value < 1 || value > MAX_ROWS) {
    throw new SeoError(
      'INVALID_INPUT',
      `maxRows must be a whole number between 1 and ${MAX_ROWS}.`,
    )
  }
  return value
}

function evidence(result: AiReferralQueryResult): AiReferralQueryEvidence {
  return {
    status: result.truncated || result.warnings.length ? 'partial' : 'complete',
    calls: result.calls,
    returnedRows: result.returnedRows,
    ...(result.availableRows !== undefined
      ? { availableRows: result.availableRows }
      : {}),
    ...(result.timeZone ? { timeZone: result.timeZone } : {}),
    ...(result.emptyReason ? { emptyReason: result.emptyReason } : {}),
    truncated: result.truncated,
    warnings: result.warnings,
  }
}

function skippedEvidence(): AiReferralQueryEvidence {
  return {
    status: 'skipped',
    calls: 0,
    returnedRows: 0,
    truncated: false,
    warnings: [],
  }
}

function unavailableEvidence(message: string): AiReferralQueryEvidence {
  return {
    status: 'unavailable',
    calls: 1,
    returnedRows: 0,
    truncated: false,
    warnings: [message],
  }
}

function totalUsersFromRows(
  rows: Array<Record<string, string>>,
): number | undefined {
  const value = rows[0]?.totalUsers
  if (value === undefined || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
}

export async function aiReferralsReport(
  input: {
    property: string
    startDate?: string
    endDate?: string
    maxRows?: number
    limit?: number
    refresh?: boolean
  },
  dependencies: {
    runGa4Report?: RunGa4Report
    now?: () => Date
  } = {},
): Promise<AiReferralReport> {
  const property = input.property.trim()
  if (!property) throw new SeoError('INVALID_INPUT', 'property is required.')
  const range = reportRange(input)
  const retainedRows = maxRows(input)
  const query = dependencies.runGa4Report ?? runGa4Report

  const sourceResult = await fetchAiReferralRows({
    property,
    request: {
      dateRanges: [range],
      dimensions: [{ name: 'sessionSource' }],
      metrics: [{ name: 'sessions' }, { name: 'eventCount' }],
      orderBys: [
        { dimension: { dimensionName: 'sessionSource' }, desc: false },
      ],
    },
    maxRows: retainedRows,
    refresh: input.refresh,
    label: 'AI referral source-discovery query',
    query,
  })
  const observedSources = [
    ...new Set(
      sourceResult.rows
        .map((row) => row.sessionSource ?? '')
        .filter((source) => aiReferralSourceForValue(source)),
    ),
  ].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))

  let detailResult: AiReferralQueryResult | undefined
  let usersResult: AiReferralQueryResult | undefined
  let detailEvidence = skippedEvidence()
  let totalUsers: number | null = null
  let totalUsersEvidence = skippedEvidence()
  if (observedSources.length > 0) {
    const dimensionFilter = sessionSourceInListFilter(observedSources)
    try {
      detailResult = await fetchAiReferralRows({
        property,
        request: {
          dateRanges: [range],
          dimensions: [
            { name: 'date' },
            { name: 'sessionSource' },
            { name: 'landingPagePlusQueryString' },
          ],
          metrics: [{ name: 'sessions' }, { name: 'eventCount' }],
          dimensionFilter,
          orderBys: [
            { dimension: { dimensionName: 'date' }, desc: false },
            { dimension: { dimensionName: 'sessionSource' }, desc: false },
            {
              dimension: { dimensionName: 'landingPagePlusQueryString' },
              desc: false,
            },
          ],
        },
        maxRows: retainedRows,
        refresh: input.refresh,
        label: 'AI referral landing-page detail query',
        query,
      })
      detailEvidence = evidence(detailResult)
    } catch (error) {
      detailEvidence = unavailableEvidence(
        `The landing-page detail query failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    try {
      usersResult = await fetchAiReferralRows({
        property,
        request: {
          dateRanges: [range],
          metrics: [{ name: 'totalUsers' }],
          dimensionFilter,
        },
        maxRows: 1,
        refresh: input.refresh,
        label: 'AI referral total-users query',
        query,
      })
      totalUsers = totalUsersFromRows(usersResult.rows) ?? null
      totalUsersEvidence = evidence(usersResult)
      if (totalUsers === null) {
        totalUsersEvidence = unavailableEvidence(
          'The de-duplicated total-users query returned no valid value.',
        )
      }
    } catch (error) {
      totalUsersEvidence = unavailableEvidence(
        `The de-duplicated total-users query failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  } else if (!sourceResult.truncated && sourceResult.warnings.length === 0) {
    totalUsers = 0
  }

  return analyzeAiReferralRows({
    property,
    generatedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
    range,
    maxRows: retainedRows,
    sourceRows: sourceResult.rows,
    detailRows: detailResult?.rows ?? [],
    totalUsers,
    sourceDiscovery: evidence(sourceResult),
    detail: detailEvidence,
    totalUsersEvidence,
  })
}
