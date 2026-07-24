import { SeoError } from '../../errors.js'
import { AhrefsLinkProvider } from '../../providers/ahrefs/link-research.js'
import type {
  ProviderCoverage,
  ProviderRequestContext,
} from '../../providers/contracts.js'
import { DataForSeoLinkProvider } from '../../providers/dataforseo/link-research.js'
import { ProviderError } from '../../providers/errors.js'
import type { LinkSummaryProvider } from '../../providers/link-contracts.js'
import type {
  CompetitiveDomainRatingObservation,
  CompetitiveLinkSummaryObservation,
} from '../competitive-opportunity-contract.js'
import {
  type DomainRatingReport,
  domainRatingReport,
} from '../domain-rating.js'
import type { ValidatedCompetitiveOpportunitiesInput } from './input.js'

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : 'The provider request failed.'
}

function unavailableForRemaining(error: unknown): boolean {
  return (
    (error instanceof SeoError &&
      ['INVALID_INPUT', 'PROVIDER_UNAVAILABLE'].includes(error.code)) ||
    (error instanceof ProviderError &&
      ['configuration', 'authentication'].includes(error.code))
  )
}

export async function acquireCompetitiveDomainRatings(input: {
  options: ValidatedCompetitiveOpportunitiesInput
  domains: string[]
  reportRunId: string
  report?: typeof domainRatingReport
}): Promise<CompetitiveDomainRatingObservation[]> {
  if (input.options.competitionEvidence === 'serp') return []
  const observations: CompetitiveDomainRatingObservation[] = []
  let sharedFailure: string | null = null
  for (const domain of input.domains) {
    if (sharedFailure) {
      observations.push({
        domain,
        status: 'unavailable',
        report: null,
        reason: sharedFailure,
      })
      continue
    }
    try {
      const report: DomainRatingReport = await (
        input.report ?? domainRatingReport
      )({
        target: domain,
        targetMode: 'domain',
        provider: 'ahrefs',
        refresh: input.options.refresh,
        context: {
          projectId: input.options.projectId,
          reportId: 'competitive-opportunities',
          reportRunId: input.reportRunId,
        },
      })
      observations.push({
        domain,
        status: report.dataStatus,
        report,
        reason:
          report.dataStatus === 'unavailable' ? report.summary.verdict : null,
      })
    } catch (error) {
      const reason = errorReason(error)
      observations.push({
        domain,
        status: 'unavailable',
        report: null,
        reason,
      })
      if (unavailableForRemaining(error)) sharedFailure = reason
    }
  }
  return observations
}

function defaultLinkProvider(
  provider: 'ahrefs' | 'dataforseo',
): LinkSummaryProvider {
  return provider === 'ahrefs'
    ? new AhrefsLinkProvider()
    : new DataForSeoLinkProvider()
}

function linkStatus(
  completeness: ProviderCoverage['completeness'],
): CompetitiveLinkSummaryObservation['status'] {
  if (completeness === 'unavailable' || completeness === 'invalid') {
    return 'unavailable'
  }
  return completeness === 'complete' ? 'complete' : 'partial'
}

export async function acquireCompetitiveLinkSummaries(input: {
  options: ValidatedCompetitiveOpportunitiesInput
  domains: string[]
  reportRunId: string
  provider?: LinkSummaryProvider
}): Promise<CompetitiveLinkSummaryObservation[]> {
  if (input.options.competitionEvidence !== 'link-summary') return []
  const provider =
    input.provider ?? defaultLinkProvider(input.options.linkProvider)
  const context: ProviderRequestContext = {
    projectId: input.options.projectId,
    reportId: 'competitive-opportunities',
    reportRunId: input.reportRunId,
  }
  const observations: CompetitiveLinkSummaryObservation[] = []
  let sharedFailure: string | null = null
  for (const domain of input.domains) {
    if (sharedFailure) {
      observations.push({
        domain,
        status: 'unavailable',
        evidence: null,
        reason: sharedFailure,
      })
      continue
    }
    try {
      const evidence = await provider.linkSummary({
        target: domain,
        scope: 'domain',
        includeSubdomains: true,
        refresh: input.options.refresh,
        context,
      })
      const status = linkStatus(evidence.coverage.completeness)
      observations.push({
        domain,
        status,
        evidence,
        reason:
          status === 'unavailable'
            ? 'The provider did not return a usable link summary.'
            : null,
      })
    } catch (error) {
      const reason = errorReason(error)
      observations.push({
        domain,
        status: 'unavailable',
        evidence: null,
        reason,
      })
      if (unavailableForRemaining(error)) sharedFailure = reason
    }
  }
  return observations
}
