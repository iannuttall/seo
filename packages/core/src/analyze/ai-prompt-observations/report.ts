import { randomUUID } from 'node:crypto'
import PQueue from 'p-queue'
import {
  priorAiPromptObservation,
  type StoredAiPromptObservation,
  saveAiPromptObservation,
} from '../../ai-prompt-observations/store.js'
import { SeoError } from '../../errors.js'
import type {
  AiPromptEvidence,
  AiPromptModel,
  AiPromptObservation,
  AiPromptObservationProvider,
  ProviderCostEvidence,
  ProviderId,
} from '../../providers/contracts.js'
import { DataForSeoAiPromptObservationProvider } from '../../providers/dataforseo/ai-prompt-observations.js'
import { readDataForSeoCredentials } from '../../providers/dataforseo/credentials.js'
import { ProviderError } from '../../providers/errors.js'
import type { ProviderCandidate } from '../../providers/resolver.js'
import { resolveProvider } from '../../providers/resolver.js'
import type Database from '../../storage/sqlite.js'
import {
  acquireGscQueries,
  type DomainResearchDependencies,
} from '../domain-research/shared.js'
import {
  createFirstPartyMatcher,
  type FirstPartyContext,
  fanOutThemes,
  type TargetObservation,
  targetObservations,
} from './analysis.js'
import {
  type AiPromptInput,
  type AiPromptModelInput,
  type AiPromptTargetInput,
  validateAiPromptObservationInput,
} from './validation.js'

const DEFAULT_CONCURRENCY = 4

export type AiPromptObservationsInput = {
  prompts: AiPromptInput[]
  models: AiPromptModelInput[]
  target: AiPromptTargetInput
  competitors?: AiPromptTargetInput[]
  market: { countryCode: string; languageCode: string }
  provider?: ProviderId
  webSearch?: boolean
  maxOutputTokens?: number
  site?: string
  days?: number
  projectId?: string
  refresh?: boolean
}

export type AiPromptObservationsDependencies = DomainResearchDependencies & {
  database?: Database.Database
  concurrency?: number
}

type ObservationComparison = {
  status:
    | 'no-prior'
    | 'cached-observation'
    | 'model-changed'
    | 'incomplete-evidence'
    | 'comparable'
  previousCheckedAt: string | null
  previousEffectiveModel: string | null
  answerChanged: boolean | null
  citationDomainsAdded: string[]
  citationDomainsRemoved: string[]
  targetChanges: Array<{
    key: string
    label: string
    change:
      | 'appeared'
      | 'disappeared'
      | 'unchanged-observed'
      | 'unchanged-not-observed'
  }>
  detail: string
}

type CompletedObservation = {
  state: 'complete'
  observationKey: string
  promptId: string
  promptGroup: string | null
  prompt: string
  surface: AiPromptModelInput['surface']
  requestedModel: string
  effectiveModel: string
  checkedAt: string
  answer: string
  answerTruncated: boolean
  citations: AiPromptObservation['citations']
  fanOutQueries: Array<{
    query: string
    firstParty: FirstPartyContext
  }>
  tokens: {
    input: number | null
    output: number | null
    reasoning: number | null
  }
  webSearch: { requested: boolean; observed: boolean | null }
  targets: TargetObservation[]
  comparison: ObservationComparison
  evidence: AiPromptEvidence<AiPromptObservation>
}

type FailedObservation = {
  state: 'unavailable'
  observationKey: string
  promptId: string
  promptGroup: string | null
  prompt: string
  surface: AiPromptModelInput['surface']
  requestedModel: string
  error: { code: string; message: string }
}

export type AiPromptObservationsReport = {
  schemaVersion: 1
  methodology: 'fixed_ai_prompt_observations_v1'
  generatedAt: string
  dataStatus: 'complete' | 'partial' | 'unavailable'
  market: { countryCode: string; languageCode: string }
  configuration: {
    prompts: number
    models: number
    requestedObservations: number
    webSearch: boolean
    maxOutputTokens: number
    provider: ProviderId
    refresh: boolean
  }
  summary: {
    completed: number
    unavailable: number
    cached: number
    comparable: number
    targetObserved: number
    targetCited: number
    competitorOnly: number
    verdict: string
  }
  source: {
    firstParty: {
      requested: boolean
      status: 'not-requested' | 'complete' | 'empty' | 'partial' | 'unavailable'
      site: string | null
      range: { startDate: string; endDate: string } | null
      rowsFetched: number
      calls: number
      maxRows: number
      possiblyTruncated: boolean
      error: { code: string; message: string } | null
    }
  }
  processing: {
    firstPartyRows: number
    firstPartyTermVisits: number
    retainedFirstPartyPostings: number
    firstPartyCandidateVisits: number
  }
  observations: Array<CompletedObservation | FailedObservation>
  citedDomains: Array<{
    domain: string
    observationCount: number
    surfaces: AiPromptModelInput['surface'][]
    targetKeys: string[]
  }>
  fanOutThemes: ReturnType<typeof fanOutThemes>
  cost: ProviderCostEvidence & {
    estimateBasis: 'provider-base-fees-only'
    actualCostState: 'complete' | 'partial-or-unknown'
  }
  findings: Array<{
    code:
      | 'target-appeared'
      | 'target-disappeared'
      | 'target-not-observed'
      | 'competitor-only-observed'
      | 'owned-citation-observed'
      | 'first-party-fan-out-overlap'
      | 'repeated-fan-out-theme'
    evidenceRefs: string[]
    detail: string
    action: string
  }>
  warnings: string[]
  caveats: string[]
  nextSteps: string[]
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function providerFailure(error: unknown): never {
  if (!(error instanceof ProviderError)) throw error
  if (error.code === 'configuration' || error.code === 'budget-limit') {
    throw new SeoError('INVALID_INPUT', error.message)
  }
  if (error.code === 'rate-limit') {
    throw new SeoError('RATE_LIMITED', error.message)
  }
  throw new SeoError('PROVIDER_UNAVAILABLE', error.message)
}

async function defaultCandidates(): Promise<readonly ProviderCandidate[]> {
  return [
    {
      adapter: new DataForSeoAiPromptObservationProvider(),
      connected: Boolean(await readDataForSeoCredentials()),
      priority: 10,
    },
  ]
}

function promptProvider(
  adapter: ProviderCandidate['adapter'],
): AiPromptObservationProvider | null {
  return 'aiPromptModels' in adapter &&
    typeof adapter.aiPromptModels === 'function' &&
    'observeAiPrompt' in adapter &&
    typeof adapter.observeAiPrompt === 'function'
    ? (adapter as AiPromptObservationProvider)
    : null
}

async function resolvePromptProvider(
  input: ReturnType<typeof validateAiPromptObservationInput>,
  dependencies: AiPromptObservationsDependencies,
): Promise<AiPromptObservationProvider> {
  let candidates: readonly ProviderCandidate[]
  try {
    candidates = dependencies.candidates ?? (await defaultCandidates())
  } catch (error) {
    return providerFailure(error)
  }
  const resolution = resolveProvider({
    capability: 'ai-prompt-observation',
    market: {
      searchEngine: 'google',
      countryCode: input.market.countryCode,
      languageCode: input.market.languageCode,
    },
    candidates,
    provider: input.provider,
  })
  if (resolution.status === 'unavailable') {
    throw new SeoError(
      resolution.reason === 'market-not-supported'
        ? 'INVALID_INPUT'
        : 'PROVIDER_UNAVAILABLE',
      resolution.reason === 'provider-not-connected'
        ? 'No connected provider can collect AI prompt observations. Run `seo providers dataforseo connect` first.'
        : 'No configured provider can collect AI prompt observations for this market.',
    )
  }
  const provider = promptProvider(resolution.provider)
  if (!provider) {
    throw new SeoError(
      'PROVIDER_UNAVAILABLE',
      'The selected provider has no AI prompt observation implementation.',
    )
  }
  return provider
}

async function preflightModels(
  provider: AiPromptObservationProvider,
  input: ReturnType<typeof validateAiPromptObservationInput>,
): Promise<void> {
  const catalogs = new Map<AiPromptModelInput['surface'], AiPromptModel[]>()
  for (const surface of [
    ...new Set(input.models.map((item) => item.surface)),
  ]) {
    try {
      catalogs.set(surface, await provider.aiPromptModels(surface))
    } catch (error) {
      return providerFailure(error)
    }
  }
  for (const selection of input.models) {
    const model = catalogs
      .get(selection.surface)
      ?.find((item) => item.name === selection.model)
    if (!model) {
      throw new SeoError(
        'INVALID_INPUT',
        `Model ${selection.model} is not in the current ${selection.surface} model catalog. Describe the report and choose a current model before starting paid work.`,
      )
    }
    if (input.webSearch && !model.webSearchSupported) {
      throw new SeoError(
        'INVALID_INPUT',
        `Model ${selection.model} does not support web search.`,
      )
    }
    const minimumTokens =
      selection.surface === 'claude' && model.reasoning
        ? 1_025
        : model.reasoning
          ? 1_024
          : 1
    if (input.maxOutputTokens < minimumTokens) {
      throw new SeoError(
        'INVALID_INPUT',
        `Model ${selection.model} needs at least ${minimumTokens} output tokens.`,
      )
    }
  }
}

function comparison(
  current: StoredAiPromptObservation,
  prior: StoredAiPromptObservation | null,
  currentTargets: TargetObservation[],
  previousTargets: TargetObservation[],
  cacheStatus: AiPromptEvidence<AiPromptObservation>['cache']['status'],
): ObservationComparison {
  const base = {
    previousCheckedAt: prior?.checkedAt ?? null,
    previousEffectiveModel: prior?.effectiveModel ?? null,
    answerChanged: null,
    citationDomainsAdded: [] as string[],
    citationDomainsRemoved: [] as string[],
    targetChanges: [] as ObservationComparison['targetChanges'],
  }
  if (cacheStatus === 'hit') {
    return {
      ...base,
      status: 'cached-observation',
      detail:
        'This run reused the same cached provider observation, so it is not a new comparison point.',
    }
  }
  if (!prior) {
    return {
      ...base,
      status: 'no-prior',
      detail: 'No earlier observation has the same fixed configuration.',
    }
  }
  if (current.effectiveModel !== prior.effectiveModel) {
    return {
      ...base,
      status: 'model-changed',
      detail:
        'The provider resolved the requested model to a different effective version, so answer and mention changes are not treated as comparable.',
    }
  }
  if (
    current.completeness !== 'complete' ||
    prior.completeness !== 'complete' ||
    current.answerTruncated ||
    prior.answerTruncated
  ) {
    return {
      ...base,
      status: 'incomplete-evidence',
      detail:
        'At least one observation is partial or truncated, so absence and change claims are withheld.',
    }
  }
  const currentDomains = new Set(current.citations.map((item) => item.domain))
  const priorDomains = new Set(prior.citations.map((item) => item.domain))
  const previousByKey = new Map(previousTargets.map((item) => [item.key, item]))
  const targetChanges = currentTargets.map((item) => {
    const previous = previousByKey.get(item.key)
    const wasObserved = previous?.answerState === 'observed'
    const isObserved = item.answerState === 'observed'
    return {
      key: item.key,
      label: item.label,
      change: isObserved
        ? wasObserved
          ? ('unchanged-observed' as const)
          : ('appeared' as const)
        : wasObserved
          ? ('disappeared' as const)
          : ('unchanged-not-observed' as const),
    }
  })
  return {
    ...base,
    status: 'comparable',
    answerChanged: current.answer !== prior.answer,
    citationDomainsAdded: [...currentDomains]
      .filter((domain) => !priorDomains.has(domain))
      .sort(compareText),
    citationDomainsRemoved: [...priorDomains]
      .filter((domain) => !currentDomains.has(domain))
      .sort(compareText),
    targetChanges,
    detail:
      'Prompt, requested model, effective model, market, web-search setting, token limit, and provider match the earlier observation.',
  }
}

function aggregateCost(
  observations: Array<CompletedObservation | FailedObservation>,
): AiPromptObservationsReport['cost'] {
  const completed = observations.filter(
    (item): item is CompletedObservation => item.state === 'complete',
  )
  const estimates = completed.map((item) => item.evidence.cost.estimatedMicros)
  const actual = completed.map((item) => item.evidence.cost.actualMicros)
  const exact =
    observations.every((item) => item.state === 'complete') &&
    actual.every((value) => value !== null)
  return {
    currency: 'USD',
    estimatedMicros: estimates.some((value) => value === null)
      ? null
      : estimates.reduce<number>((sum, value) => sum + (value ?? 0), 0),
    actualMicros: exact
      ? actual.reduce<number>((sum, value) => sum + (value ?? 0), 0)
      : null,
    taskIds: [
      ...new Set(completed.flatMap((item) => item.evidence.cost.taskIds)),
    ].sort(compareText),
    estimateBasis: 'provider-base-fees-only',
    actualCostState: exact ? 'complete' : 'partial-or-unknown',
  }
}

function citedDomains(
  observations: CompletedObservation[],
): AiPromptObservationsReport['citedDomains'] {
  const grouped = new Map<
    string,
    {
      observations: Set<string>
      surfaces: Set<AiPromptModelInput['surface']>
      targets: Set<string>
    }
  >()
  for (const observation of observations) {
    for (const citation of observation.citations) {
      const current = grouped.get(citation.domain) ?? {
        observations: new Set<string>(),
        surfaces: new Set<AiPromptModelInput['surface']>(),
        targets: new Set<string>(),
      }
      current.observations.add(observation.observationKey)
      current.surfaces.add(observation.surface)
      for (const target of observation.targets) {
        if (target.citedDomains.includes(citation.domain)) {
          current.targets.add(target.key)
        }
      }
      grouped.set(citation.domain, current)
    }
  }
  return [...grouped.entries()]
    .map(([domain, item]) => ({
      domain,
      observationCount: item.observations.size,
      surfaces: [...item.surfaces].sort(compareText),
      targetKeys: [...item.targets].sort(compareText),
    }))
    .sort(
      (left, right) =>
        right.observationCount - left.observationCount ||
        compareText(left.domain, right.domain),
    )
    .slice(0, 50)
}

function reportFindings(
  observations: CompletedObservation[],
  themes: AiPromptObservationsReport['fanOutThemes'],
): AiPromptObservationsReport['findings'] {
  const findings: AiPromptObservationsReport['findings'] = []
  for (const [index, observation] of observations.entries()) {
    const target = observation.targets.find((item) => item.role === 'target')
    const competitors = observation.targets.filter(
      (item) => item.role === 'competitor',
    )
    const targetChange = observation.comparison.targetChanges.find(
      (item) => item.key === 'target',
    )
    if (targetChange?.change === 'appeared') {
      findings.push({
        code: 'target-appeared',
        evidenceRefs: [`observations[${index}].comparison`],
        detail: `${target?.label ?? 'The target'} appeared in this comparable answer sample after not being observed in the prior sample.`,
        action:
          'Inspect the answer context and cited sources before treating the appearance as a durable change.',
      })
    } else if (targetChange?.change === 'disappeared') {
      findings.push({
        code: 'target-disappeared',
        evidenceRefs: [`observations[${index}].comparison`],
        detail: `${target?.label ?? 'The target'} was not observed in this comparable answer sample after appearing in the prior sample.`,
        action:
          'Repeat the same fixed observation and inspect source changes before deciding whether any content or distribution work is justified.',
      })
    }
    if (
      target?.answerState === 'not-observed' &&
      competitors.some((item) => item.answerState === 'observed')
    ) {
      findings.push({
        code: 'competitor-only-observed',
        evidenceRefs: [`observations[${index}].targets`],
        detail:
          'At least one supplied competitor was observed in this answer while the target was not observed.',
        action:
          'Compare the cited evidence, entity framing, and existing first-party pages before treating this sample as a content gap.',
      })
    }
    if ((target?.citedDomains.length ?? 0) > 0) {
      findings.push({
        code: 'owned-citation-observed',
        evidenceRefs: [`observations[${index}].targets[0].citedDomains`],
        detail: `A supplied target domain was cited in the ${observation.surface} answer sample.`,
        action:
          'Open the cited page and verify the quoted claim, freshness, and surrounding answer context.',
      })
    }
  }
  const targetObserved = observations.filter(
    (item) =>
      item.targets.find((target) => target.role === 'target')?.answerState ===
      'observed',
  ).length
  if (observations.length > 0 && targetObserved === 0) {
    findings.push({
      code: 'target-not-observed',
      evidenceRefs: observations.map(
        (_, index) => `observations[${index}].targets[0]`,
      ),
      detail:
        'The target was not observed in the completed answer samples in this bounded basket.',
      action:
        'Do not treat this as universal absence. Review the exact prompts and models, then repeat only the observations that affect a real decision.',
    })
  }
  for (const [index, theme] of themes.slice(0, 3).entries()) {
    findings.push({
      code:
        theme.firstParty.status === 'matched'
          ? 'first-party-fan-out-overlap'
          : 'repeated-fan-out-theme',
      evidenceRefs: [`fanOutThemes[${index}]`],
      detail:
        theme.firstParty.status === 'matched'
          ? `${theme.term} recurred across ${theme.observationCount} observations and overlaps retained Search Console query evidence.`
          : `${theme.term} recurred across ${theme.observationCount} observations, but no retained Search Console match was established.`,
      action:
        theme.firstParty.status === 'matched'
          ? 'Inspect the matched landing pages and cited sources before changing or expanding coverage.'
          : 'Validate intent, independent keyword demand, current results, available source data, and useful page variation before planning new coverage.',
    })
  }
  return findings.slice(0, 20)
}

export async function aiPromptObservationsReport(
  input: AiPromptObservationsInput,
  dependencies: AiPromptObservationsDependencies = {},
): Promise<AiPromptObservationsReport> {
  const validated = validateAiPromptObservationInput(input)
  const now = (dependencies.now ?? (() => new Date()))()
  const provider = await resolvePromptProvider(validated, dependencies)
  await preflightModels(provider, validated)

  let firstPartyRows: Awaited<ReturnType<typeof acquireGscQueries>> | null =
    null
  let firstPartyError: { code: string; message: string } | null = null
  if (input.site) {
    try {
      firstPartyRows = await acquireGscQueries({
        site: input.site,
        days: validated.days,
        refresh: input.refresh,
        dependencies,
        now,
      })
    } catch (error) {
      firstPartyError = {
        code: error instanceof SeoError ? error.code : 'PROVIDER_UNAVAILABLE',
        message:
          error instanceof Error
            ? error.message
            : 'Search Console context was unavailable.',
      }
    }
  }
  const firstParty = createFirstPartyMatcher(firstPartyRows?.rows ?? null)
  const reportRunId = randomUUID()
  const queue = new PQueue({
    concurrency: Math.max(
      1,
      Math.min(dependencies.concurrency ?? DEFAULT_CONCURRENCY, 4),
    ),
  })
  const tasks = validated.prompts.flatMap((prompt) =>
    validated.models.map((model) => ({ prompt, model })),
  )
  const results = await Promise.all(
    tasks.map(({ prompt, model }) =>
      queue.add(async (): Promise<CompletedObservation | FailedObservation> => {
        const observationKey = `${prompt.id}:${model.surface}:${model.model}`
        try {
          const evidence = await provider.observeAiPrompt({
            prompt: prompt.prompt,
            surface: model.surface,
            model: model.model,
            market: validated.market,
            webSearch: validated.webSearch,
            maxOutputTokens: validated.maxOutputTokens,
            refresh: input.refresh,
            context: {
              projectId: input.projectId,
              reportId: 'ai-prompt-observations',
              reportRunId,
            },
          })
          const stored = saveAiPromptObservation(
            {
              promptId: prompt.id,
              promptGroup: prompt.group ?? undefined,
              prompt: prompt.prompt,
              surface: model.surface,
              countryCode: validated.market.countryCode,
              languageCode: validated.market.languageCode,
              maxOutputTokens: validated.maxOutputTokens,
              evidence,
            },
            { database: dependencies.database, now: dependencies.now },
          )
          const prior = priorAiPromptObservation(stored, {
            database: dependencies.database,
          })
          const targets = targetObservations(
            stored.answer,
            stored.citations,
            validated.targets,
          )
          const previousTargets = prior
            ? targetObservations(
                prior.answer,
                prior.citations,
                validated.targets,
              )
            : []
          return {
            state: 'complete',
            observationKey,
            promptId: prompt.id,
            promptGroup: prompt.group,
            prompt: prompt.prompt,
            surface: model.surface,
            requestedModel: model.model,
            effectiveModel: stored.effectiveModel,
            checkedAt: stored.checkedAt,
            answer: stored.answer,
            answerTruncated: stored.answerTruncated,
            citations: stored.citations,
            fanOutQueries: stored.fanOutQueries.map((query) => ({
              query,
              firstParty: firstParty.match(query),
            })),
            tokens: {
              input: stored.inputTokens,
              output: stored.outputTokens,
              reasoning: stored.reasoningTokens,
            },
            webSearch: {
              requested: stored.webSearchRequested,
              observed: stored.webSearchObserved,
            },
            targets,
            comparison: comparison(
              stored,
              prior,
              targets,
              previousTargets,
              evidence.cache.status,
            ),
            evidence,
          }
        } catch (error) {
          if (!(error instanceof ProviderError)) throw error
          return {
            state: 'unavailable',
            observationKey,
            promptId: prompt.id,
            promptGroup: prompt.group,
            prompt: prompt.prompt,
            surface: model.surface,
            requestedModel: model.model,
            error: { code: error.code, message: error.message },
          }
        }
      }),
    ),
  )
  const observations = results.filter(
    (item): item is CompletedObservation | FailedObservation => Boolean(item),
  )
  const completed = observations.filter(
    (item): item is CompletedObservation => item.state === 'complete',
  )
  const themes = fanOutThemes(
    completed.map((item) => ({
      observationKey: item.observationKey,
      surface: item.surface,
      fanOutQueries: item.fanOutQueries.map((query) => query.query),
    })),
    firstParty,
  )
  const targetObserved = completed.filter(
    (item) =>
      item.targets.find((target) => target.role === 'target')?.answerState ===
      'observed',
  ).length
  const targetCited = completed.filter(
    (item) =>
      (item.targets.find((target) => target.role === 'target')?.citedDomains
        .length ?? 0) > 0,
  ).length
  const competitorOnly = completed.filter((item) => {
    const target = item.targets.find((entry) => entry.role === 'target')
    return (
      target?.answerState === 'not-observed' &&
      item.targets.some(
        (entry) =>
          entry.role === 'competitor' && entry.answerState === 'observed',
      )
    )
  }).length
  const unavailable = observations.length - completed.length
  const cached = completed.filter(
    (item) => item.comparison.status === 'cached-observation',
  ).length
  const comparable = completed.filter(
    (item) => item.comparison.status === 'comparable',
  ).length
  const dataStatus: AiPromptObservationsReport['dataStatus'] =
    completed.length === 0
      ? 'unavailable'
      : unavailable > 0 ||
          completed.some(
            (item) => item.evidence.coverage.completeness !== 'complete',
          )
        ? 'partial'
        : 'complete'
  const warnings = [
    ...(firstPartyError
      ? [`Search Console context was unavailable: ${firstPartyError.message}`]
      : []),
    ...(unavailable > 0
      ? [
          `${unavailable} of ${validated.requestCount} prompt observations were unavailable; total actual cost is therefore incomplete or unknown.`,
        ]
      : []),
  ]
  return {
    schemaVersion: 1,
    methodology: 'fixed_ai_prompt_observations_v1',
    generatedAt: now.toISOString(),
    dataStatus,
    market: validated.market,
    configuration: {
      prompts: validated.prompts.length,
      models: validated.models.length,
      requestedObservations: validated.requestCount,
      webSearch: validated.webSearch,
      maxOutputTokens: validated.maxOutputTokens,
      provider: provider.provider,
      refresh: input.refresh ?? false,
    },
    summary: {
      completed: completed.length,
      unavailable,
      cached,
      comparable,
      targetObserved,
      targetCited,
      competitorOnly,
      verdict:
        completed.length === 0
          ? 'No prompt observation completed, so no answer, mention, citation, or change conclusion is available.'
          : `${completed.length} of ${validated.requestCount} fixed prompt observations completed; the target was observed in ${targetObserved} and cited in ${targetCited} answer samples.`,
    },
    source: {
      firstParty: {
        requested: Boolean(input.site),
        status: !input.site
          ? 'not-requested'
          : firstPartyError
            ? 'unavailable'
            : firstPartyRows?.possiblyTruncated
              ? 'partial'
              : (firstPartyRows?.rows.length ?? 0) > 0
                ? 'complete'
                : 'empty',
        site: input.site ?? null,
        range: firstPartyRows?.range ?? null,
        rowsFetched: firstPartyRows?.rowsFetched ?? 0,
        calls: firstPartyRows?.calls ?? 0,
        maxRows: firstPartyRows?.maxRows ?? 0,
        possiblyTruncated: firstPartyRows?.possiblyTruncated ?? false,
        error: firstPartyError,
      },
    },
    processing: {
      firstPartyRows: firstParty.processing.rows,
      firstPartyTermVisits: firstParty.processing.termVisits,
      retainedFirstPartyPostings: firstParty.processing.retainedPostings,
      firstPartyCandidateVisits: firstParty.processing.candidateVisits,
    },
    observations,
    citedDomains: citedDomains(completed),
    fanOutThemes: themes,
    cost: aggregateCost(observations),
    findings: reportFindings(completed, themes),
    warnings,
    caveats: [
      'Each result is one generated answer from one exact prompt, provider, requested model, effective model, market label, web-search setting, and collection time. It is not a census of what every user sees.',
      'A target marked not observed was absent only from that retained answer sample under the supplied aliases. It does not prove universal absence or poor visibility.',
      'A citation records a URL returned in the answer metadata. It does not prove the source supports every generated claim, drove a referral, or will be cited again.',
      'The language code labels and separates the fixed basket. This provider does not expose a separate language filter for LLM responses, so prompt wording remains the direct language instruction.',
      'Fan-out themes and Search Console overlap are bounded lexical heuristics. They do not prove shared intent, independent demand, a content gap, or that a programmatic template should be built.',
      'Change findings require the same effective model version and complete observations. Model changes, cache reuse, partial answers, and truncated answers stay non-comparable.',
      'The preflight estimate includes provider base fees only. Exact total cost is recorded from each completed response after token and web-search charges are known.',
    ],
    nextSteps: [
      'Inspect the answer text, effective model, citations, target matches, cache state, and exact cost before acting on a finding.',
      'Use repeated fan-out themes as research leads, then validate intent with keyword metrics and current result evidence before planning new pages or programmatic templates.',
      'Where retained Search Console queries overlap, inspect the existing landing pages before treating the theme as missing coverage.',
      'Repeat only decision-critical prompts with the same configuration. A changed effective model is a new baseline, not a rank change.',
    ],
  }
}
