import {
  bearerAuthorization,
  fetchProviderJson,
  isRecord,
  nonNegativeNumber,
  normalizeProviderDomain,
  type ProviderAdapterDependencies,
  type ProviderDataStatus,
  providerCheckedAt,
} from './provider-adapter.ts'

const ENDPOINT = 'https://api.ahrefs.com/v3/public/domain-rating-free'

export type AhrefsDomainRatingInput = {
  target: string
  apiKey: string
}

export type AhrefsDomainRatingResult = {
  schema: 1
  target: string
  dataStatus: ProviderDataStatus
  domainRating: number | null
  warnings: Array<{
    code: 'provider-estimate' | 'metric-unavailable' | 'provider-warning'
    message: string
  }>
  provenance: {
    provider: 'ahrefs'
    endpoint: typeof ENDPOINT
    checkedAt: string
    attribution: {
      label: 'Domain Rating by Ahrefs'
      url: 'https://ahrefs.com/'
      licenseUrl: 'https://ahrefs.com/legal/domain-rating-license'
    }
    providerWarningReceived: boolean
  }
}

export async function checkAhrefsDomainRating(
  input: AhrefsDomainRatingInput,
  dependencies: ProviderAdapterDependencies = {},
): Promise<AhrefsDomainRatingResult> {
  const target = normalizeProviderDomain(input.target)
  const url = new URL(ENDPOINT)
  url.searchParams.set('target', target)
  const payload = await fetchProviderJson(
    url,
    {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: bearerAuthorization(input.apiKey),
      },
    },
    dependencies,
  )
  const domainRating = isRecord(payload) ? payload.domain_rating : undefined
  if (!isRecord(domainRating)) {
    return unavailable(target, dependencies)
  }
  const rawRating = nonNegativeNumber(domainRating.domain_rating)
  const rating = rawRating !== null && rawRating <= 100 ? rawRating : null
  const providerWarningReceived =
    typeof domainRating.warning === 'string' && domainRating.warning.length > 0
  const warnings: AhrefsDomainRatingResult['warnings'] = [
    {
      code: 'provider-estimate',
      message:
        'Domain Rating is an Ahrefs link authority estimate. It is not Google PageRank or a Google ranking score.',
    },
  ]
  if (providerWarningReceived) {
    warnings.push({
      code: 'provider-warning',
      message: 'Ahrefs returned a warning with this result.',
    })
  }
  if (rating === null) {
    warnings.push({
      code: 'metric-unavailable',
      message: 'Ahrefs did not return a Domain Rating for this domain.',
    })
  }

  return {
    schema: 1,
    target,
    dataStatus: rating === null ? 'unavailable' : 'complete',
    domainRating: rating,
    warnings,
    provenance: provenance(dependencies, providerWarningReceived),
  }
}

function unavailable(
  target: string,
  dependencies: ProviderAdapterDependencies,
): AhrefsDomainRatingResult {
  return {
    schema: 1,
    target,
    dataStatus: 'unavailable',
    domainRating: null,
    warnings: [
      {
        code: 'provider-estimate',
        message:
          'Domain Rating is an Ahrefs link authority estimate. It is not Google PageRank or a Google ranking score.',
      },
      {
        code: 'metric-unavailable',
        message: 'Ahrefs did not return a Domain Rating for this domain.',
      },
    ],
    provenance: provenance(dependencies, false),
  }
}

function provenance(
  dependencies: ProviderAdapterDependencies,
  providerWarningReceived: boolean,
): AhrefsDomainRatingResult['provenance'] {
  return {
    provider: 'ahrefs',
    endpoint: ENDPOINT,
    checkedAt: providerCheckedAt(dependencies),
    attribution: {
      label: 'Domain Rating by Ahrefs',
      url: 'https://ahrefs.com/',
      licenseUrl: 'https://ahrefs.com/legal/domain-rating-license',
    },
    providerWarningReceived,
  }
}
