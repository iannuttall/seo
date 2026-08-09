import {
  basicAuthorization,
  dataForSeoTask,
  fetchProviderJson,
  isRecord,
  normalizeProviderDomainOrPage,
  type ProviderAdapterDependencies,
  type ProviderDataStatus,
  providerCheckedAt,
} from './provider-adapter.ts'

const ENDPOINT = 'https://api.dataforseo.com/v3/backlinks/bulk_spam_score/live'

export type DataForSeoSpamScoreInput = {
  target: string
  login: string
  password: string
}

export type DataForSeoSpamScoreResult = {
  schema: 1
  target: string
  dataStatus: ProviderDataStatus
  spamScore: number | null
  warnings: Array<{
    code: 'provider-estimate' | 'metric-unavailable'
    message: string
  }>
  provenance: {
    provider: 'dataforseo'
    endpoint: typeof ENDPOINT
    checkedAt: string
    providerCostUsd: number | null
    attribution: {
      label: 'Spam Score by DataForSEO'
      url: 'https://dataforseo.com/'
    }
    limits: {
      requestedTargets: 1
      returnedTargets: 0 | 1
    }
  }
}

export async function checkDataForSeoSpamScore(
  input: DataForSeoSpamScoreInput,
  dependencies: ProviderAdapterDependencies = {},
): Promise<DataForSeoSpamScoreResult> {
  const target = normalizeProviderDomainOrPage(input.target)
  const payload = await fetchProviderJson(
    ENDPOINT,
    {
      method: 'POST',
      headers: {
        authorization: basicAuthorization(input.login, input.password),
        accept: 'application/json',
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify([{ targets: [target] }]),
    },
    dependencies,
  )
  const { result, costUsd } = dataForSeoTask(payload)
  const items = Array.isArray(result.items) ? result.items : []
  const item = items.find(
    (candidate) =>
      isRecord(candidate) &&
      candidate.type === 'backlinks_bulk_spam_score' &&
      candidate.target === target,
  )
  const rawScore = isRecord(item) ? item.spam_score : null
  const spamScore =
    typeof rawScore === 'number' &&
    Number.isInteger(rawScore) &&
    rawScore >= 0 &&
    rawScore <= 100
      ? rawScore
      : null
  const dataStatus: ProviderDataStatus =
    spamScore === null ? 'unavailable' : 'complete'
  const warnings: DataForSeoSpamScoreResult['warnings'] = [
    {
      code: 'provider-estimate',
      message:
        'DataForSEO Spam Score is a third-party estimate. It is not a Google metric or proof of a search penalty.',
    },
  ]
  if (spamScore === null) {
    warnings.push({
      code: 'metric-unavailable',
      message: 'DataForSEO did not return a spam score for this target.',
    })
  }

  return {
    schema: 1,
    target,
    dataStatus,
    spamScore,
    warnings,
    provenance: {
      provider: 'dataforseo',
      endpoint: ENDPOINT,
      checkedAt: providerCheckedAt(dependencies),
      providerCostUsd: costUsd,
      attribution: {
        label: 'Spam Score by DataForSEO',
        url: 'https://dataforseo.com/',
      },
      limits: {
        requestedTargets: 1,
        returnedTargets: spamScore === null ? 0 : 1,
      },
    },
  }
}
