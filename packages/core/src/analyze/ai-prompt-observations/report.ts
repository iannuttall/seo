import { randomUUID } from 'node:crypto'
import PQueue from 'p-queue'
import {
  priorAiPromptObservation,
  saveAiPromptObservation,
} from '../../ai-prompt-observations/store.js'
import { SeoError } from '../../errors.js'
import type {
  AiPromptModel,
  AiPromptObservationProvider,
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
  fanOutThemes,
  targetObservations,
} from './analysis.js'
import type {
  AiPromptObservationsReport,
  CompletedObservation,
  FailedObservation,
} from './contracts.js'
import {
  aggregateObservationCost,
  citedObservationDomains,
  compareObservation,
  observationFindings,
} from './insights.js'
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
      const available = (catalogs.get(selection.surface) ?? [])
        .map((item) => item.name)
        .slice(0, 10)
      throw new SeoError(
        'INVALID_INPUT',
        `Model ${selection.model} is not in the current ${selection.surface} model catalog. Available models: ${available.join(', ') || 'none returned'}. No paid request was started.`,
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
            fanOutQueries: stored.fanOutQueries.map((query) => ({
              query,
              firstParty: firstParty.match(query),
            })),
            targets,
            comparison: compareObservation(
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
          firstPartyRows?.possiblyTruncated ||
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
    citedDomains: citedObservationDomains(completed),
    fanOutThemes: themes,
    cost: aggregateObservationCost(observations),
    findings: observationFindings(completed, themes),
    warnings,
    caveats: [
      'Each result is one generated answer from one exact prompt, provider, requested model, effective model, market label, web-search setting, and collection time. It is not a census of what every user sees.',
      'A target marked not observed was absent only from that retained answer sample under the supplied aliases. It does not prove universal absence or poor visibility.',
      'A citation records a URL returned in the answer metadata. It does not prove the source supports every generated claim, drove a referral, or will be cited again.',
      'The language code labels and separates the fixed prompt set. This provider does not expose a separate language filter for LLM responses, so prompt wording remains the direct language instruction.',
      'Supporting-search themes returned in fanOutThemes and Search Console word or phrase matches are bounded research leads. They do not prove shared intent, independent demand, a content gap, or that a programmatic template should be built.',
      'Change findings require the same effective model version and complete observations. Model changes, cache reuse, partial answers, and truncated answers stay non-comparable.',
      'The preflight estimate includes provider base fees only. Exact total cost is recorded from each completed response after token and web-search charges are known.',
    ],
    nextSteps: [
      'Inspect the answer text, effective model, citations, target matches, cache state, and exact cost before acting on a finding.',
      'Use repeated supporting-search themes as research leads, then validate intent with keyword metrics and current result evidence before planning new pages or programmatic templates.',
      'Where retained Search Console queries overlap, inspect the existing landing pages before treating the theme as missing coverage.',
      'Repeat only decision-critical prompts with the same configuration. A changed effective model is a new baseline, not a rank change.',
    ],
  }
}
