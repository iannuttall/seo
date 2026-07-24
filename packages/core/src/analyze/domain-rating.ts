import { randomUUID } from 'node:crypto'
import { SeoError } from '../errors.js'
import { readAhrefsApiKey } from '../providers/ahrefs/credentials.js'
import { AhrefsDomainRatingProvider } from '../providers/ahrefs/domain-rating.js'
import type {
  ProviderId,
  ProviderRequestContext,
} from '../providers/contracts.js'
import type {
  DomainRatingProvider,
  DomainRatingTargetMode,
} from '../providers/domain-rating-contracts.js'
import { ProviderError } from '../providers/errors.js'
import {
  type ProviderCandidate,
  resolveProvider,
} from '../providers/resolver.js'

const RESOLUTION_MARKET = {
  searchEngine: 'google' as const,
  countryCode: 'US',
  languageCode: 'en',
}

export type DomainRatingReport = {
  schemaVersion: 1
  generatedAt: string
  dataStatus: 'complete' | 'unavailable'
  summary: {
    target: string
    targetMode: DomainRatingTargetMode
    domainRating: number | null
    verdict: string
  }
  evidence: Awaited<ReturnType<DomainRatingProvider['domainRating']>>
  caveats: string[]
  nextSteps: string[]
}

export type DomainRatingReportDependencies = {
  candidates?: readonly ProviderCandidate[]
  now?: () => Date
}

function provider(
  adapter: ProviderCandidate['adapter'],
): DomainRatingProvider | null {
  return 'domainRating' in adapter && typeof adapter.domainRating === 'function'
    ? (adapter as DomainRatingProvider)
    : null
}

async function defaultCandidates(): Promise<readonly ProviderCandidate[]> {
  return [
    {
      adapter: new AhrefsDomainRatingProvider(),
      connected: Boolean(await readAhrefsApiKey()),
      priority: 10,
    },
  ]
}

function reportError(error: unknown): never {
  if (!(error instanceof ProviderError)) throw error
  throw new SeoError(
    error.code === 'configuration'
      ? 'INVALID_INPUT'
      : error.code === 'rate-limit'
        ? 'RATE_LIMITED'
        : 'PROVIDER_UNAVAILABLE',
    error.message,
  )
}

export async function domainRatingReport(
  input: {
    target: string
    targetMode?: DomainRatingTargetMode
    provider?: ProviderId
    refresh?: boolean
    context?: ProviderRequestContext
  },
  dependencies: DomainRatingReportDependencies = {},
): Promise<DomainRatingReport> {
  const candidates = dependencies.candidates ?? (await defaultCandidates())
  const resolution = resolveProvider({
    capability: 'domain-rating',
    market: RESOLUTION_MARKET,
    candidates,
    provider: input.provider,
  })
  if (resolution.status === 'unavailable') {
    throw new SeoError(
      'PROVIDER_UNAVAILABLE',
      resolution.reason === 'provider-not-connected'
        ? 'Ahrefs is not connected. Run `seo providers ahrefs connect` first.'
        : 'The selected provider cannot supply Domain Rating.',
    )
  }
  const adapter = provider(resolution.provider)
  if (!adapter) {
    throw new SeoError(
      'PROVIDER_UNAVAILABLE',
      'The selected provider does not implement Domain Rating.',
    )
  }

  let evidence: Awaited<ReturnType<DomainRatingProvider['domainRating']>>
  try {
    evidence = await adapter.domainRating({
      target: input.target,
      targetMode: input.targetMode,
      refresh: input.refresh,
      context: input.context ?? {
        reportId: 'domain-rating',
        reportRunId: randomUUID(),
      },
    })
  } catch (error) {
    return reportError(error)
  }
  const rating =
    evidence.data.domainRating.state === 'observed'
      ? evidence.data.domainRating.value
      : null
  const dataStatus = rating === null ? 'unavailable' : 'complete'
  return {
    schemaVersion: 1,
    generatedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
    dataStatus,
    summary: {
      target: evidence.data.target,
      targetMode: evidence.data.targetMode,
      domainRating: rating,
      verdict:
        rating === null
          ? `Ahrefs did not return Domain Rating for ${evidence.data.target}.`
          : `${evidence.data.target} has an observed Ahrefs Domain Rating of ${rating}.`,
    },
    evidence,
    caveats: [
      'Domain Rating is an Ahrefs 0-100 logarithmic estimate of backlink-profile strength. It is not a Google metric, ranking factor, traffic estimate, or keyword-difficulty score.',
      'A lower value does not by itself mean a result is easy to outrank. Compare the current result page, page relevance, URL-level link evidence, content, and your own site evidence.',
      `Use of this value is subject to the provider license at ${evidence.data.licenseUrl} and requires the attribution “${evidence.data.attribution}”.`,
    ],
    nextSteps: [
      'Run link-evidence for bounded referring-link rows and provider summary counts.',
      'Run serp-results for a decision-critical keyword before comparing ranking pages.',
      'Use domain-overview, ranking-pages, and ranked-keywords for separate search-footprint evidence.',
    ],
  }
}
