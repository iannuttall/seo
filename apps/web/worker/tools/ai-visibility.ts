import { runAiAnswers } from '@seo/core/commands'
import {
  allowLocalTurnstileTest,
  dailyLimit,
  RESEARCH_COUNTRIES,
} from './paid-tool-routes.ts'
import {
  handleProtectedTool,
  type ProtectedToolParsedInput,
} from './protected-tool-handler.ts'

// The AI visibility checker: the person's own questions, asked live of
// ChatGPT search, the Gemini app, Google AI Mode and Google AI Overviews,
// and whether each answer cites or names their site and which competitors
// it cites or names instead. One sample of each answer, on the site's
// DataForSEO account. The guard reserves 4 cents a run: 3 questions on 4
// engines at about $0.0096 a question.

const MAX_QUESTIONS = 3
const MAX_QUESTION_CHARACTERS = 200
const MAX_BRANDS = 3
const MAX_BRAND_CHARACTERS = 60
const MAX_COMPETITORS = 3
// How long queued answers are read back before the rest show as not ready.
const WAIT_SECONDS = 40
const TOP_SITES = 10
const TOP_SEARCHES = 15

const ENGINES = [
  'chatgpt',
  'gemini',
  'google_ai_mode',
  'google_ai_overview',
] as const
const RESULTS = [
  'cited',
  'mentioned',
  'neither',
  'no_answer',
  'unavailable',
  'pending',
] as const
type AnswerResult = (typeof RESULTS)[number]
// Results that say what the answer showed.
const READ = new Set<AnswerResult>([
  'cited',
  'mentioned',
  'neither',
  'no_answer',
])

type AiVisibilityInput = {
  domain: string
  brands: string[]
  questions: string[]
  competitors: string[]
  country: string
}

type CoreRow = {
  question?: unknown
  engine?: unknown
  result?: unknown
  cited_url?: unknown
  mentioned_as?: unknown
  sources?: unknown
  searches?: unknown
  answered_at?: unknown
  others?: unknown
  error?: unknown
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid request.')
  }
  return value as Record<string, unknown>
}

function exactFields(
  value: Record<string, unknown>,
  fields: readonly string[],
): void {
  if (Object.keys(value).some((field) => !fields.includes(field))) {
    throw new TypeError('Invalid request.')
  }
}

function stringList(value: unknown, max: number): string[] {
  if (value === undefined) return []
  if (
    !Array.isArray(value) ||
    value.length > max ||
    value.some((item) => typeof item !== 'string')
  ) {
    throw new TypeError('Invalid request.')
  }
  return value as string[]
}

const clean = (value: string) => value.trim().replace(/\s+/gu, ' ')

function domain(value: string): string {
  const raw = value.trim().toLowerCase()
  if (!/^(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}\/?$/u.test(raw)) {
    throw new TypeError('Invalid domain.')
  }
  return raw
    .replace(/^https?:\/\//u, '')
    .replace(/\/$/u, '')
    .replace(/^www\./u, '')
}

function parseAiVisibility(
  value: unknown,
): ProtectedToolParsedInput<AiVisibilityInput> {
  const input = record(value)
  exactFields(input, [
    'domain',
    'brands',
    'questions',
    'competitors',
    'country',
    'turnstileToken',
  ])
  if (
    typeof input.domain !== 'string' ||
    typeof input.turnstileToken !== 'string' ||
    typeof input.country !== 'string' ||
    !RESEARCH_COUNTRIES.includes(
      input.country as (typeof RESEARCH_COUNTRIES)[number],
    )
  ) {
    throw new TypeError('Invalid request.')
  }
  const site = domain(input.domain)

  const questions = [
    ...new Set(stringList(input.questions, MAX_QUESTIONS).map(clean)),
  ]
  if (
    !questions.length ||
    questions.some((q) => !q || q.length > MAX_QUESTION_CHARACTERS)
  ) {
    throw new TypeError('Invalid questions.')
  }

  const brands = [...new Set(stringList(input.brands, MAX_BRANDS).map(clean))]
  if (brands.some((b) => !b || b.length > MAX_BRAND_CHARACTERS)) {
    throw new TypeError('Invalid brand.')
  }

  const competitors = [
    ...new Set(stringList(input.competitors, MAX_COMPETITORS).map(domain)),
  ].filter((other) => other !== site)

  return {
    target: site,
    turnstileToken: input.turnstileToken,
    providerInput: {
      domain: site,
      brands,
      questions,
      competitors,
      country: input.country,
    },
  }
}

// Business context and Search Console are never read by the free page:
// the questions and competitors always come from the form.
const unused = async (): Promise<never> => {
  throw new Error('Not available on the free AI visibility checker.')
}
const NO_DEPS = {
  searchAnalytics: unused,
  context: { read: unused, write: unused },
}

const text = (value: unknown) =>
  typeof value === 'string' && value ? value : null
const strings = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
const resultOf = (value: unknown): AnswerResult =>
  RESULTS.includes(value as AnswerResult)
    ? (value as AnswerResult)
    : 'unavailable'

async function checkAiVisibility(
  env: Cloudflare.Env,
  input: AiVisibilityInput,
) {
  const { data } = await runAiAnswers(
    {
      site: input.domain,
      country: input.country,
      detail: 'full',
      offset: 0,
      questions: input.questions,
      brand: input.brands,
      // Always given, so no business context is looked up.
      others: input.competitors.map((other) => ({ domain: other })),
      store: null,
      waitSeconds: WAIT_SECONDS,
      samples: 1,
    },
    new Headers({
      'x-dataforseo-login': env.DATAFORSEO_LOGIN,
      'x-dataforseo-password': env.DATAFORSEO_PASSWORD,
    }),
    NO_DEPS,
    () => '',
  )
  const result = data as Record<string, unknown>
  const coreRows = (Array.isArray(result.rows) ? result.rows : []) as CoreRow[]

  const rows = coreRows
    .map((row) => {
      const answer = resultOf(row.result)
      const others = record(
        row.others && typeof row.others === 'object' ? row.others : {},
      )
      const error = text(row.error)
      return {
        question: String(row.question ?? ''),
        engine: String(row.engine ?? ''),
        result: answer,
        // The page on the site the answer cites, the first one found.
        citedUrl: text(row.cited_url),
        // For a mention, the name or domain the answer text used.
        mentionedAs: text(row.mentioned_as),
        // The other sites the answer cites, by host.
        otherSites: strings(row.sources),
        // Competitors the answer cites or names. Empty for an answer that
        // was not read, which the result says.
        competitors: input.competitors.flatMap((other) => {
          const value = others[other]
          return value === 'cited' || value === 'mentioned'
            ? [{ domain: other, result: value }]
            : []
        }),
        // ChatGPT's web searches: [] when it ran none, null when not read
        // or the engine does not report them.
        searches: Array.isArray(row.searches) ? strings(row.searches) : null,
        answeredAt: text(row.answered_at),
        // Why an engine could not be asked in this country, when that is
        // the reason. Other provider errors are not shown.
        reason:
          answer === 'unavailable' && error?.startsWith("DataForSEO's ")
            ? error
            : null,
        others,
      }
    })
    .sort(
      (a, b) =>
        input.questions.indexOf(a.question) -
          input.questions.indexOf(b.question) ||
        ENGINES.indexOf(a.engine as (typeof ENGINES)[number]) -
          ENGINES.indexOf(b.engine as (typeof ENGINES)[number]) ||
        a.question.localeCompare(b.question) ||
        a.engine.localeCompare(b.engine),
    )

  // Share of voice over the answers read: the site first, then each
  // competitor by how many answers cite or name it.
  const read = rows.filter((row) => READ.has(row.result))
  const voice = (name: string, of: (row: (typeof rows)[number]) => unknown) => {
    const results = read.map(of)
    return {
      domain: name,
      read: read.length,
      cited: results.filter((r) => r === 'cited').length,
      mentioned: results.filter((r) => r === 'mentioned').length,
    }
  }
  const named = (v: { cited: number; mentioned: number }) =>
    v.cited + v.mentioned
  const shareOfVoice = [
    { ...voice(input.domain, (row) => row.result), site: true },
    ...input.competitors
      .map((other) => ({
        ...voice(other, (row) => row.others[other]),
        site: false,
      }))
      .sort((a, b) => named(b) - named(a) || a.domain.localeCompare(b.domain)),
  ]

  const tally = (values: string[][]) => {
    const counts = new Map<string, number>()
    for (const list of values) {
      for (const value of new Set(list)) {
        counts.set(value, (counts.get(value) ?? 0) + 1)
      }
    }
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }
  const topCitedSites = tally(rows.map((row) => row.otherSites))
    .slice(0, TOP_SITES)
    .map(([host, answers]) => ({ host, answers }))
  const chatgptSearches = tally(
    rows.map((row) => (row.searches ?? []).map((query) => query.toLowerCase())),
  )
    .slice(0, TOP_SEARCHES)
    .map(([query, answers]) => ({ query, answers }))

  const counts = Object.fromEntries(
    RESULTS.map((name) => [
      name,
      rows.filter((row) => row.result === name).length,
    ]),
  ) as Record<AnswerResult, number>

  return {
    domain: input.domain,
    brands: input.brands,
    brandTerms: strings(result.brandTerms),
    competitors: input.competitors,
    country: input.country,
    questions: input.questions,
    rows: rows.map(({ others: _, ...row }) => row),
    counts,
    shareOfVoice,
    topCitedSites,
    chatgptSearches,
    costUsd: typeof result.costUsd === 'number' ? result.costUsd : null,
    checkedAt: new Date().toISOString(),
  }
}

export function handleAiVisibility(
  request: Request,
  env: Cloudflare.Env,
): Promise<Response> {
  return handleProtectedTool(request, env, {
    tool: 'ai-visibility',
    providerDailyLimit: dailyLimit(env.DATAFORSEO_AI_DAILY_CENTS),
    allowLocalhostTurnstileForTests: allowLocalTurnstileTest(request),
    parse: parseAiVisibility,
    provider: (input) => checkAiVisibility(env, input),
  })
}
