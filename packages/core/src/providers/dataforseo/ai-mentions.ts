import { randomUUID } from 'node:crypto'
import type {
  AiMentionEvidence,
  AiMentionMetric,
  AiMentionMetrics,
  AiMentionProvider,
  AiMentionRequest,
  AiMentionSample,
  AiMentionSource,
  ProviderValue,
  ProviderWarning,
} from '../contracts.js'
import { aiMentionMarketSchema } from '../contracts.js'
import { ProviderError } from '../errors.js'
import type {
  DataForSeoAiMentionMetricsRequest,
  DataForSeoAiMentionMetricsSnapshot,
  DataForSeoAiMentionSearchRequest,
  DataForSeoAiMentionSearchSnapshot,
} from './ai-mention-client.js'
import { DataForSeoClient, type DataForSeoClientOptions } from './client.js'

const METRICS_ENDPOINTS = {
  single: 'v3/ai_optimization/llm_mentions/target_metrics/live',
  multi: 'v3/ai_optimization/llm_mentions/multi_target_metrics/live',
} as const
const SEARCH_ENDPOINT = 'v3/ai_optimization/llm_mentions/search_mentions/live'
const MAX_ANSWER_EXCERPT_CHARACTERS = 2_000
const MAX_SOURCES_PER_SAMPLE = 10

type AiMentionClient = {
  aiMentionMetrics(
    input: DataForSeoAiMentionMetricsRequest,
  ): Promise<DataForSeoAiMentionMetricsSnapshot>
  aiMentionSearch(
    input: DataForSeoAiMentionSearchRequest,
  ): Promise<DataForSeoAiMentionSearchSnapshot>
}

export type DataForSeoAiMentionProviderOptions = DataForSeoClientOptions & {
  client?: AiMentionClient
}

type MetricGroup = {
  key?: string
  sources_domain?: Array<{
    key: string | number
    mentions?: number
    ai_search_volume?: number
  }> | null
  total?: { mentions?: number; ai_search_volume?: number } | null
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function observedNumber(value: number | undefined): ProviderValue<number> {
  return value === undefined
    ? {
        state: 'missing',
        value: null,
        reason: 'The provider did not return this metric.',
      }
    : { state: 'observed', value }
}

function observedTimestamp(
  value: string | null | undefined,
): ProviderValue<string> {
  if (!value) {
    return {
      state: 'missing',
      value: null,
      reason: 'The provider did not return an observation time.',
    }
  }
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp)
    ? { state: 'observed', value: new Date(timestamp).toISOString() }
    : {
        state: 'invalid',
        value: null,
        reason: 'The provider returned an invalid observation time.',
      }
}

function observedBoolean(
  value: boolean | null | undefined,
): ProviderValue<boolean> {
  return value === null || value === undefined
    ? {
        state: 'missing',
        value: null,
        reason: 'The provider did not return this flag.',
      }
    : { state: 'observed', value }
}

function normalizeDomain(value: string): string | null {
  const input = value.trim().toLowerCase()
  if (!input) return null
  try {
    const parsed = new URL(input.includes('://') ? input : `https://${input}`)
    const domain = parsed.hostname.replace(/^www\./u, '').replace(/\.$/u, '')
    return domain.includes('.') && domain.length <= 253 ? domain : null
  } catch {
    return null
  }
}

function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const parsed = new URL(value)
    if (!['http:', 'https:'].includes(parsed.protocol)) return null
    parsed.username = ''
    parsed.password = ''
    return parsed.toString()
  } catch {
    return null
  }
}

function sourceDomains(group: MetricGroup | undefined): {
  rows: AiMentionMetric['sourceDomains']
  invalidRows: number
} {
  let invalidRows = 0
  const grouped = new Map<
    string,
    { mentions: number; aiSearchVolume: number }
  >()
  for (const item of group?.sources_domain ?? []) {
    const domain = normalizeDomain(String(item.key))
    if (
      !domain ||
      item.mentions === undefined ||
      item.ai_search_volume === undefined
    ) {
      invalidRows += 1
      continue
    }
    const current = grouped.get(domain) ?? { mentions: 0, aiSearchVolume: 0 }
    current.mentions += item.mentions
    current.aiSearchVolume += item.ai_search_volume
    grouped.set(domain, current)
  }
  return {
    rows: [...grouped.entries()]
      .map(([domain, item]) => ({ domain, ...item }))
      .sort(
        (left, right) =>
          right.mentions - left.mentions ||
          right.aiSearchVolume - left.aiSearchVolume ||
          compareText(left.domain, right.domain),
      )
      .slice(0, 10),
    invalidRows,
  }
}

function platform(input: AiMentionRequest): 'google' | 'chat_gpt' {
  return input.market.surface === 'chatgpt' ? 'chat_gpt' : 'google'
}

function providerLocation(input: AiMentionRequest) {
  return input.market.location.code !== undefined
    ? { locationCode: input.market.location.code }
    : { locationName: input.market.location.name }
}

function validatedInput(input: AiMentionRequest): AiMentionRequest {
  const market = aiMentionMarketSchema.safeParse(input.market)
  if (!market.success) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'ai-mentions',
      code: 'configuration',
      message: 'Use a valid AI mention market and surface.',
    })
  }
  if (
    market.data.surface === 'chatgpt' &&
    (market.data.countryCode !== 'US' ||
      market.data.languageCode !== 'en' ||
      (market.data.location.code !== undefined &&
        market.data.location.code !== 2840))
  ) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'ai-mentions',
      code: 'configuration',
      message:
        'DataForSEO ChatGPT mention data currently supports United States English only.',
    })
  }
  return { ...input, market: market.data }
}

function metricsResult(snapshot: DataForSeoAiMentionMetricsSnapshot) {
  return snapshot.response.tasks.flatMap((task) => task.result ?? [])[0]
}

export function mapDataForSeoAiMentionMetrics(
  input: AiMentionRequest,
  snapshot: DataForSeoAiMentionMetricsSnapshot,
): AiMentionEvidence<AiMentionMetrics> {
  const result = metricsResult(snapshot)
  const targets = [input.target, ...input.competitors]
  const multi = targets.length > 1
  const rawGroups: MetricGroup[] = multi
    ? (result?.items ?? [])
    : result?.aggregated_metrics
      ? [{ ...result.aggregated_metrics, key: input.target.key }]
      : []
  const groups = new Map<string, MetricGroup>()
  let invalidRows = 0
  for (const group of rawGroups) {
    if (!group.key || groups.has(group.key)) {
      invalidRows += 1
      continue
    }
    groups.set(group.key, group)
  }
  const mapped = targets.map((target) => {
    const group = groups.get(target.key)
    const domains = sourceDomains(group)
    invalidRows += domains.invalidRows
    return {
      target,
      mentions: observedNumber(group?.total?.mentions),
      aiSearchVolume: observedNumber(group?.total?.ai_search_volume),
      sourceDomains: domains.rows,
    }
  })
  const combinedGroup = result?.aggregated_metrics
  const combinedDomains = sourceDomains(combinedGroup ?? undefined)
  invalidRows += combinedDomains.invalidRows
  const warnings: ProviderWarning[] = [...snapshot.warnings]
  if (invalidRows > 0) {
    warnings.push({
      code: 'invalid-ai-mention-metric-rows',
      message: `The provider returned ${invalidRows} duplicate or invalid AI mention metric row${invalidRows === 1 ? '' : 's'} that could not be retained.`,
    })
  }
  return {
    schemaVersion: 1,
    provider: 'dataforseo',
    capability: 'ai-mentions',
    data: {
      targets: mapped,
      combined: {
        mentions: observedNumber(combinedGroup?.total?.mentions),
        aiSearchVolume: observedNumber(combinedGroup?.total?.ai_search_volume),
        sourceDomains: combinedDomains.rows,
      },
    },
    observedAt: snapshot.observedAt,
    market: input.market,
    coverage: {
      requestedRows: targets.length,
      returnedRows: snapshot.returnedRows,
      retainedRows: mapped.filter(
        (item) =>
          item.mentions.state === 'observed' ||
          item.aiSearchVolume.state === 'observed',
      ).length,
      invalidRows,
      providerTotalRows: result?.total_count ?? null,
      completeness: invalidRows > 0 ? 'partial' : 'complete',
      nextCursor: null,
    },
    cache: snapshot.cache,
    cost: snapshot.cost,
    request: {
      operation: 'ai-mention-metrics',
      endpoint: multi ? METRICS_ENDPOINTS.multi : METRICS_ENDPOINTS.single,
      limit: targets.length,
      filters: {
        surface: input.market.surface,
        countryCode: input.market.countryCode,
        languageCode: input.market.languageCode,
        aliases: targets.reduce(
          (sum, target) => sum + target.aliases.length,
          0,
        ),
      },
      sort: ['mentions:descending', 'target.key:codepoint-ascending'],
    },
    warnings,
  }
}

function mentionSource(
  source: {
    rank?: number
    domain?: string | null
    url?: string | null
    title?: string | null
    source_name?: string | null
  },
  fallbackRank: number,
): AiMentionSource | null {
  const url = safeUrl(source.url)
  const domain = normalizeDomain(source.domain ?? '')
  if (!url || !domain) return null
  return {
    rank: source.rank ?? fallbackRank,
    domain,
    url,
    title: source.title?.trim() || null,
    sourceName: source.source_name?.trim() || null,
  }
}

export function mapDataForSeoAiMentionSamples(
  input: AiMentionRequest,
  snapshot: DataForSeoAiMentionSearchSnapshot,
): AiMentionEvidence<AiMentionSample[]> {
  const result = snapshot.response.tasks.flatMap((task) => task.result ?? [])[0]
  const warnings: ProviderWarning[] = [...snapshot.warnings]
  let invalidRows = 0
  let truncatedAnswers = 0
  let truncatedSources = 0
  const seen = new Set<string>()
  const samples = (result?.items ?? [])
    .flatMap((item) => {
      const question = item.question?.trim()
      if (!question || seen.has(question.toLowerCase())) {
        invalidRows += 1
        return []
      }
      seen.add(question.toLowerCase())
      const answer = item.answer?.trim() ?? ''
      const answerTruncated = answer.length > MAX_ANSWER_EXCERPT_CHARACTERS
      if (answerTruncated) truncatedAnswers += 1
      const mappedSources = (item.sources ?? []).flatMap((source, index) => {
        const mapped = mentionSource(source, index + 1)
        if (!mapped) invalidRows += 1
        return mapped ? [mapped] : []
      })
      const sources = mappedSources
        .sort(
          (left, right) =>
            left.rank - right.rank || compareText(left.url, right.url),
        )
        .slice(0, MAX_SOURCES_PER_SAMPLE)
      if (mappedSources.length > sources.length) truncatedSources += 1
      return [
        {
          question,
          answerExcerpt: answer.slice(0, MAX_ANSWER_EXCERPT_CHARACTERS),
          answerTruncated,
          model: item.model_name?.trim() || null,
          aiSearchVolume: observedNumber(item.ai_search_volume ?? undefined),
          firstObservedAt: observedTimestamp(item.first_response_at),
          lastObservedAt: observedTimestamp(item.last_response_at),
          isWebSearchBased: observedBoolean(item.is_web_search_based),
          sources,
        },
      ]
    })
    .sort(
      (left, right) =>
        (right.aiSearchVolume.state === 'observed'
          ? right.aiSearchVolume.value
          : -1) -
          (left.aiSearchVolume.state === 'observed'
            ? left.aiSearchVolume.value
            : -1) || compareText(left.question, right.question),
    )
    .slice(0, input.sampleLimit)
  if (invalidRows > 0) {
    warnings.push({
      code: 'invalid-ai-mention-sample-rows',
      message: `The provider returned ${invalidRows} duplicate or invalid AI mention sample value${invalidRows === 1 ? '' : 's'} that could not be retained.`,
    })
  }
  if (truncatedAnswers > 0 || truncatedSources > 0) {
    warnings.push({
      code: 'bounded-ai-mention-sample-detail',
      message: `${truncatedAnswers} answer excerpt${truncatedAnswers === 1 ? '' : 's'} and ${truncatedSources} source list${truncatedSources === 1 ? '' : 's'} were shortened to keep structured output bounded.`,
    })
  }
  const providerTotalRows = result?.total_count ?? null
  const capped =
    providerTotalRows !== null && providerTotalRows > samples.length
  return {
    schemaVersion: 1,
    provider: 'dataforseo',
    capability: 'ai-mentions',
    data: samples,
    observedAt: snapshot.observedAt,
    market: input.market,
    coverage: {
      requestedRows: input.sampleLimit,
      returnedRows: snapshot.returnedRows,
      retainedRows: samples.length,
      invalidRows,
      providerTotalRows,
      completeness:
        invalidRows > 0 ? 'partial' : capped ? 'capped' : 'complete',
      nextCursor: result?.search_after_token ?? null,
    },
    cache: snapshot.cache,
    cost: snapshot.cost,
    request: {
      operation: 'ai-mention-samples',
      endpoint: SEARCH_ENDPOINT,
      limit: input.sampleLimit,
      filters: {
        surface: input.market.surface,
        countryCode: input.market.countryCode,
        languageCode: input.market.languageCode,
        aliases: input.target.aliases.length,
      },
      sort: ['aiSearchVolume:descending', 'question:codepoint-ascending'],
    },
    warnings,
  }
}

export class DataForSeoAiMentionProvider implements AiMentionProvider {
  readonly provider = 'dataforseo' as const
  readonly capabilitySupport = [
    {
      capability: 'ai-mentions' as const,
      status: 'available' as const,
      markets: 'all' as const,
    },
  ]

  private readonly client: AiMentionClient

  constructor(options: DataForSeoAiMentionProviderOptions = {}) {
    this.client = options.client ?? new DataForSeoClient(options)
  }

  async aiMentionMetrics(
    rawInput: AiMentionRequest,
  ): Promise<AiMentionEvidence<AiMentionMetrics>> {
    const input = validatedInput(rawInput)
    const context = input.context ?? {
      reportId: 'ai-mention-research',
      reportRunId: randomUUID(),
    }
    const snapshot = await this.client.aiMentionMetrics({
      target: input.target,
      competitors: input.competitors,
      platform: platform(input),
      languageCode: input.market.languageCode.split('-')[0] as string,
      ...providerLocation(input),
      refresh: input.refresh,
      context,
    })
    return mapDataForSeoAiMentionMetrics(input, snapshot)
  }

  async aiMentionSamples(
    rawInput: AiMentionRequest,
  ): Promise<AiMentionEvidence<AiMentionSample[]>> {
    const input = validatedInput(rawInput)
    const context = input.context ?? {
      reportId: 'ai-mention-research',
      reportRunId: randomUUID(),
    }
    const snapshot = await this.client.aiMentionSearch({
      target: input.target,
      platform: platform(input),
      languageCode: input.market.languageCode.split('-')[0] as string,
      ...providerLocation(input),
      limit: input.sampleLimit,
      refresh: input.refresh,
      context,
    })
    return mapDataForSeoAiMentionSamples(input, snapshot)
  }
}
