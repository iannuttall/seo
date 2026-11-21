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

// The query fan-out tool asks ChatGPT search one prompt 3 times through
// DataForSEO and shows the web searches it reported running, the sites it
// cited, and, when a domain is given, whether each answer cited or named
// it. Gemini, AI Mode and AI Overviews do not report their searches, so
// only ChatGPT is asked.

const SAMPLES = 3
const PROMPT_CHARACTERS = 300
const DOMAIN_CHARACTERS = 253
const WAIT_SECONDS = 40
// Stands in for the site when no domain is given. A placeholder domain is
// never cited or named, and no per-site result is returned for it.
const NO_SITE = 'example.com'

type FanOutInput = { prompt: string; domain: string | null; country: string }

// What one run of the prompt showed. searched: ChatGPT ran at least one
// search. answered-without-searching: it answered from what it knew.
// no-answer: ChatGPT showed no answer. pending: the answer was not ready in
// time. unavailable: DataForSEO could not ask or read it.
type RunStatus =
  | 'searched'
  | 'answered-without-searching'
  | 'no-answer'
  | 'pending'
  | 'unavailable'

// For the given domain only, and only on runs that were read: cited, named
// in the text without a citation, or neither. null when the run was not
// read, so a failed run is never shown as "not found".
type DomainResult = 'cited' | 'named' | 'not-found' | null

type FanOutRun = {
  run: number
  status: RunStatus
  searches: string[]
  sites: string[]
  domainResult: DomainResult
  citedUrl: string | null
  namedAs: string | null
  answeredAt: string | null
}

type AnswerRow = {
  result?: unknown
  searches?: unknown
  sources?: unknown
  cited_url?: unknown
  mentioned_as?: unknown
  answered_at?: unknown
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid request.')
  }
  return value as Record<string, unknown>
}

function parseDomain(value: unknown): string | null {
  if (value === undefined) return null
  if (typeof value !== 'string' || value.length > DOMAIN_CHARACTERS * 2) {
    throw new TypeError('Invalid domain.')
  }
  const domain = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//u, '')
    .replace(/[/?#].*$/u, '')
    .replace(/^www\./u, '')
  if (!domain) return null
  if (
    domain.length > DOMAIN_CHARACTERS ||
    !/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/u.test(domain)
  ) {
    throw new TypeError('Invalid domain.')
  }
  return domain
}

function parseQueryFanOut(
  value: unknown,
): ProtectedToolParsedInput<FanOutInput> {
  const input = record(value)
  if (
    Object.keys(input).some(
      (field) =>
        !['prompt', 'domain', 'country', 'turnstileToken'].includes(field),
    )
  ) {
    throw new TypeError('Invalid request.')
  }
  if (
    typeof input.prompt !== 'string' ||
    typeof input.turnstileToken !== 'string' ||
    typeof input.country !== 'string' ||
    !RESEARCH_COUNTRIES.includes(
      input.country as (typeof RESEARCH_COUNTRIES)[number],
    )
  ) {
    throw new TypeError('Invalid request.')
  }
  const prompt = input.prompt.trim().replace(/\s+/gu, ' ')
  if (!prompt || prompt.length > PROMPT_CHARACTERS) {
    throw new TypeError('Invalid prompt.')
  }
  return {
    target: prompt,
    turnstileToken: input.turnstileToken,
    providerInput: {
      prompt,
      domain: parseDomain(input.domain),
      country: input.country,
    },
  }
}

const text = (value: unknown) =>
  typeof value === 'string' && value ? value : null

const strings = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./u, '')
  } catch {
    return null
  }
}

function statusOf(row: AnswerRow): RunStatus {
  if (row.result === 'pending') return 'pending'
  if (row.result === 'no_answer') return 'no-answer'
  if (
    row.result === 'cited' ||
    row.result === 'mentioned' ||
    row.result === 'neither'
  ) {
    // A read answer with no searches reported is ChatGPT answering from
    // what it knew, not a search that failed.
    if (!Array.isArray(row.searches)) return 'unavailable'
    return row.searches.length ? 'searched' : 'answered-without-searching'
  }
  return 'unavailable'
}

function toRun(row: AnswerRow, index: number, hasDomain: boolean): FanOutRun {
  const status = statusOf(row)
  const read = status === 'searched' || status === 'answered-without-searching'
  // Each search once per run, whatever its case.
  const seen = new Set<string>()
  const searches: string[] = []
  for (const query of strings(row.searches)) {
    const clean = query.trim().replace(/\s+/gu, ' ')
    const key = clean.toLowerCase()
    if (!clean || seen.has(key)) continue
    seen.add(key)
    searches.push(clean)
  }
  const citedUrl = hasDomain && read ? text(row.cited_url) : null
  // The sites other than the given domain come in sources; a citation of
  // the domain comes in its own field, so it is added back here.
  const citedHost = citedUrl ? hostOf(citedUrl) : null
  const sites = [
    ...new Set([
      ...(citedHost ? [citedHost] : []),
      ...strings(row.sources).map((host) => host.toLowerCase()),
    ]),
  ]
  const namedAs = hasDomain && read ? text(row.mentioned_as) : null
  return {
    run: index + 1,
    status,
    searches,
    sites: read ? sites : [],
    domainResult:
      hasDomain && read
        ? row.result === 'cited'
          ? 'cited'
          : row.result === 'mentioned'
            ? 'named'
            : 'not-found'
        : null,
    citedUrl,
    namedAs,
    answeredAt: read ? text(row.answered_at) : null,
  }
}

// How many runs did each thing, most first, then alphabetically.
function tally(
  lists: string[][],
  keyOf: (value: string) => string,
): { value: string; runs: number }[] {
  const counts = new Map<string, { value: string; runs: number }>()
  for (const list of lists) {
    for (const value of list) {
      const key = keyOf(value)
      const entry = counts.get(key)
      if (entry) entry.runs += 1
      else counts.set(key, { value, runs: 1 })
    }
  }
  return [...counts.entries()]
    .sort(
      ([keyA, a], [keyB, b]) =>
        b.runs - a.runs ||
        keyA.localeCompare(keyB) ||
        a.value.localeCompare(b.value),
    )
    .map(([, entry]) => entry)
}

export async function queryFanOut(
  env: Pick<Cloudflare.Env, 'DATAFORSEO_LOGIN' | 'DATAFORSEO_PASSWORD'>,
  input: FanOutInput,
) {
  const refuse = () => {
    throw new Error('The query fan-out tool reads no Search Console data.')
  }
  const { data } = await runAiAnswers(
    {
      site: input.domain ?? NO_SITE,
      country: input.country,
      detail: 'full',
      offset: 0,
      questions: [input.prompt],
      engines: ['chatgpt'],
      samples: SAMPLES,
      others: [],
      store: null,
      waitSeconds: WAIT_SECONDS,
    },
    new Headers({
      'x-dataforseo-login': env.DATAFORSEO_LOGIN,
      'x-dataforseo-password': env.DATAFORSEO_PASSWORD,
    }),
    {
      searchAnalytics: refuse,
      context: { read: refuse, write: refuse },
    },
    () => '',
  )
  const result = data as { rows?: unknown; domains?: unknown }
  const rows = (Array.isArray(result.rows) ? result.rows : [])
    .slice(0, SAMPLES)
    .map((row) => (row && typeof row === 'object' ? (row as AnswerRow) : {}))
  const hasDomain = input.domain !== null
  const runs = rows.map((row, index) => toRun(row, index, hasDomain))
  const judged = strings(result.domains)[0] ?? input.domain
  return {
    prompt: input.prompt,
    country: input.country,
    // The domain judged, as its registrable domain, or null when none was
    // given.
    domain: hasDomain ? judged : null,
    runsAsked: SAMPLES,
    runs,
    searches: tally(
      runs.map((run) => run.searches),
      (value) => value.toLowerCase(),
    ).map(({ value, runs: count }) => ({ query: value, runs: count })),
    sites: tally(
      runs.map((run) => run.sites),
      (value) => value,
    ).map(({ value, runs: count }) => ({ host: value, runs: count })),
    checkedAt: new Date().toISOString(),
  }
}

export function handleQueryFanOut(
  request: Request,
  env: Cloudflare.Env,
): Promise<Response> {
  return handleProtectedTool(request, env, {
    tool: 'query-fan-out',
    providerDailyLimit: dailyLimit(env.DATAFORSEO_AI_DAILY_CENTS),
    allowLocalhostTurnstileForTests: allowLocalTurnstileTest(request),
    parse: parseQueryFanOut,
    provider: (input) => queryFanOut(env, input),
  })
}
