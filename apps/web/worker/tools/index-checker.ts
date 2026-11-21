// The Google index checker: for 1 to 5 public pages, asks Google whether
// each one is in its index (the same live searches as the agent's
// seo research index_check, on the site's DataForSEO account) and runs the
// noindex checker on it, so a page that is not found comes with what may
// keep it out. A failed search or fetch is unknown, never "not indexed".
import { runResearch } from '@seo/core/commands'
import { checkNoindex, type NoindexResult } from './noindex-checker.ts'
import { parsePublicUrl, readPageSignals } from './page-signals.ts'
import {
  allowLocalTurnstileTest,
  dailyLimit,
  RESEARCH_COUNTRIES,
} from './paid-tool-routes.ts'
import {
  handleProtectedTool,
  type ProtectedToolParsedInput,
} from './protected-tool-handler.ts'
import type { SitemapFetcher } from './sitemap.ts'

export const INDEX_CHECKER_LIMITS = Object.freeze({
  urls: 5,
  inputCharacters: 2_000,
  // Pages checked at once. Each page runs up to six live searches, five at
  // a time, and a Worker holds six connections open, so more would queue.
  concurrency: 2,
  // HTML kept from the page for its exact phrases: the head and the H1.
  phraseBytes: 262_144,
  errorCharacters: 200,
})

type IndexCheckerInput = { urls: string[]; country: string }

type SearchResult =
  | 'page'
  | 'unresolved'
  | 'other_pages'
  | 'fallback'
  | 'other_sites'
  | 'empty'
  | 'error'

export type IndexSearch = {
  query: string
  device: 'desktop' | 'mobile'
  result: SearchResult
  position: number | null
  results: number
  topDomains: string
  error: string | null
}

export type IndexCheckerPage = {
  url: string
  search: {
    verdict: 'indexed' | 'not_found' | 'unknown'
    reason: string
    // The exact phrases searched, read from the page's H1 or title and its
    // meta description. Empty when the page could not be read.
    phrases: string[]
    searches: IndexSearch[]
  }
  indexability:
    | {
        state: 'checked'
        verdict: NoindexResult['verdict']
        headline: string
        summary: string
        finalUrl: string
        status: number | null
        redirects: number
        noindex: boolean
        robotsTxt: 'allowed' | 'blocked' | 'no-file' | 'unknown' | null
        canonical: {
          url: string | null
          relation: 'self' | 'other' | 'none'
        }
        checks: NoindexResult['checks']
      }
    | { state: 'unavailable'; reason: string }
  // What the two together mean for this page.
  reading: string
}

export type IndexCheckerResult = {
  country: string
  checkedAt: string
  counts: { indexed: number; notFound: number; unknown: number }
  pages: IndexCheckerPage[]
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid request.')
  }
  return value as Record<string, unknown>
}

export function parseIndexChecker(
  value: unknown,
): ProtectedToolParsedInput<IndexCheckerInput> {
  const input = record(value)
  if (
    Object.keys(input).some(
      (field) => !['urls', 'country', 'turnstileToken'].includes(field),
    ) ||
    typeof input.urls !== 'string' ||
    typeof input.turnstileToken !== 'string' ||
    input.urls.length > INDEX_CHECKER_LIMITS.inputCharacters
  ) {
    throw new TypeError('Invalid request.')
  }
  if (
    typeof input.country !== 'string' ||
    !RESEARCH_COUNTRIES.includes(
      input.country as (typeof RESEARCH_COUNTRIES)[number],
    )
  ) {
    throw new TypeError('Invalid market.')
  }
  const lines = input.urls
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
  if (!lines.length || lines.length > INDEX_CHECKER_LIMITS.urls) {
    throw new TypeError('Enter 1 to 5 URLs.')
  }
  const urls = [...new Set(lines.map((line) => parsePublicUrl(line).href))]
  return {
    target: urls.join(' '),
    turnstileToken: input.turnstileToken,
    providerInput: { urls, country: input.country },
  }
}

// Mirrors the exact phrase rule in the core index check: the H1 or the
// title before a brand suffix, at least 2 words, and the description's
// first sentence, at least 5 words, each cut to 12 words.
function phraseFrom(text: string | null, words: number): string | null {
  const cleaned = (text ?? '')
    .split(/\s+[|\u2013\u2014-]\s+/u)[0]
    ?.replace(/["“”]/gu, '')
    .trim()
  if (!cleaned || cleaned.split(/\s+/u).length < words) return null
  return cleaned.split(/\s+/u).slice(0, 12).join(' ')
}

function phrasesFrom(html: string | null, url: string): string[] {
  if (!html) return []
  const signals = readPageSignals(html, url, { robots: null, link: null })
  const sentence =
    (signals.description.value ?? '').split(/(?<=[.!?])\s/u)[0] ?? ''
  const found = [
    phraseFrom(signals.h1, 2) ?? phraseFrom(signals.title.value, 2),
    phraseFrom(sentence.replace(/[.!?]$/u, ''), 5),
  ].filter((phrase): phrase is string => Boolean(phrase))
  return [...new Set(found)].slice(0, 2)
}

// Passes every response through untouched and keeps the first part of the
// HTML the noindex check reads, so the page is fetched once, behind the
// noindex checker's public URL guard on every hop.
function capturingFetcher(base: SitemapFetcher): {
  fetcher: SitemapFetcher
  html: Map<string, string>
} {
  const html = new Map<string, string>()
  const fetcher: SitemapFetcher = async (input, init) => {
    const response = await base(input, init)
    const type = response.headers.get('content-type') ?? ''
    if (
      response.status !== 200 ||
      !response.body ||
      !/^(?:text\/html|application\/xhtml\+xml)/iu.test(type)
    ) {
      return response
    }
    const url = typeof input === 'string' ? input : String(input)
    const decoder = new TextDecoder()
    let bytes = 0
    let text = ''
    const tap = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        if (bytes < INDEX_CHECKER_LIMITS.phraseBytes) {
          text += decoder.decode(
            chunk.subarray(0, INDEX_CHECKER_LIMITS.phraseBytes - bytes),
            { stream: true },
          )
          html.set(url, text)
        }
        bytes += chunk.byteLength
        controller.enqueue(chunk)
      },
    })
    return new Response(response.body.pipeThrough(tap), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }
  return { fetcher, html }
}

function searchReason(
  verdict: IndexCheckerPage['search']['verdict'],
  searches: IndexSearch[],
): string {
  const count = (result: SearchResult) =>
    searches.filter((search) => search.result === result).length
  if (verdict === 'indexed') {
    return `Google returned the page itself for ${count('page')} of ${searches.length} searches.`
  }
  if (verdict === 'unknown') {
    return count('error')
      ? `${count('error')} of ${searches.length} searches failed, and none of the others returned the page. Try again later.`
      : 'Google returned results from the site behind redirect links that could not be matched to a page, so one of them may be this page.'
  }
  return `None of ${searches.length} searches returned the page.${count('fallback') ? ' Where the site: search showed other sites, Google had dropped the filter because nothing matched.' : ''}`
}

async function searchGoogle(
  env: Cloudflare.Env,
  url: string,
  phrases: string[],
  country: string,
): Promise<IndexCheckerPage['search']> {
  try {
    const { data } = await runResearch(
      {
        provider: 'dataforseo',
        action: 'index_check',
        target: url,
        keywords: phrases,
        country,
      },
      new Headers({
        'x-dataforseo-login': env.DATAFORSEO_LOGIN,
        'x-dataforseo-password': env.DATAFORSEO_PASSWORD,
      }),
      // A live check every time, never a saved run.
      { call: () => '', store: null },
    )
    const result = data as {
      verdict?: unknown
      phrases?: unknown
      checks?: unknown
    }
    const rows = Array.isArray(result.checks)
      ? (result.checks as Record<string, unknown>[])
      : []
    const searches: IndexSearch[] = rows.map((row) => ({
      query: String(row.query ?? ''),
      device: row.device === 'mobile' ? 'mobile' : 'desktop',
      result: String(row.result ?? 'error') as SearchResult,
      position: typeof row.position === 'number' ? row.position : null,
      results: typeof row.results === 'number' ? row.results : 0,
      topDomains: String(row.top_domains ?? ''),
      error:
        typeof row.error === 'string'
          ? row.error.slice(0, INDEX_CHECKER_LIMITS.errorCharacters)
          : null,
    }))
    const verdict =
      result.verdict === 'indexed' || result.verdict === 'not_found'
        ? result.verdict
        : 'unknown'
    if (!searches.length) {
      return {
        verdict: 'unknown',
        reason: 'The searches returned nothing to read. Try again later.',
        phrases,
        searches,
      }
    }
    return {
      verdict,
      reason: searchReason(verdict, searches),
      phrases: Array.isArray(result.phrases)
        ? result.phrases.map(String)
        : phrases,
      searches,
    }
  } catch {
    return {
      verdict: 'unknown',
      reason: 'The Google searches could not run this time. Try again later.',
      phrases,
      searches: [],
    }
  }
}

function indexabilityOf(
  result: NoindexResult,
): IndexCheckerPage['indexability'] {
  return {
    state: 'checked',
    verdict: result.verdict,
    headline: result.headline,
    summary: result.summary,
    finalUrl: result.finalUrl,
    status: result.status,
    redirects: Math.max(0, result.hops.length - 1),
    noindex: result.google.noindex,
    robotsTxt: result.robotsTxt?.state ?? null,
    canonical: {
      url: result.canonical.href ?? result.canonical.header,
      relation: result.canonical.relation,
    },
    checks: result.checks,
  }
}

// Joins the search answer with what the page tells Google. It never turns
// an unknown into a no.
function readingOf(
  search: IndexCheckerPage['search'],
  page: IndexCheckerPage['indexability'],
): string {
  // Many sites refuse unknown bots and still serve Googlebot, so a refusal
  // says nothing about what Google gets.
  const refused =
    page.state === 'checked' &&
    page.verdict === 'error-status' &&
    (page.status === 401 || page.status === 403 || page.status === 429)
  const blocker =
    page.state !== 'checked'
      ? null
      : page.verdict === 'noindex'
        ? 'the page tells Google not to index it (noindex)'
        : page.verdict === 'blocked'
          ? 'robots.txt blocks Googlebot from crawling it'
          : page.verdict === 'blocked-noindex'
            ? 'robots.txt blocks Googlebot, so it never reads the noindex on the page'
            : page.verdict === 'redirect-failed'
              ? 'the URL never reaches a page that loads'
              : page.verdict === 'error-status'
                ? refused
                  ? null
                  : `the page returns ${page.status ?? 'an error'}`
                : page.canonical.relation === 'other'
                  ? `the canonical points to ${page.canonical.url}, so Google may index that URL instead`
                  : page.redirects
                    ? `the URL redirects to ${page.finalUrl}, the page Google indexes instead`
                    : null
  if (search.verdict === 'indexed') {
    return blocker
      ? `Google has the page, but ${blocker}. It may drop out or be replaced after Google next crawls it.`
      : 'Google has the page in its index, and nothing on the page asks it to leave.'
  }
  if (search.verdict === 'unknown') {
    return blocker
      ? `Not known whether Google has the page. Separately, ${blocker}.`
      : 'Not known whether Google has the page. Run the check again later, or use URL Inspection if the site is yours.'
  }
  if (page.state !== 'checked' || refused) {
    return 'Google did not return the page, and the page itself could not be read to check its noindex and robots.txt rules. Confirm with URL Inspection if the site is yours.'
  }
  return blocker
    ? `Google did not return the page, and ${blocker}. That is a likely reason.`
    : 'Google did not return the page, and nothing on it blocks indexing. It may be new, not crawled yet, or crawled and not indexed. Confirm with URL Inspection if the site is yours.'
}

async function checkPage(
  env: Cloudflare.Env,
  url: string,
  country: string,
  now: Date,
): Promise<IndexCheckerPage> {
  const { fetcher, html } = capturingFetcher(fetch)
  let indexability: IndexCheckerPage['indexability']
  let phrases: string[] = []
  try {
    const result = await checkNoindex(new URL(url), url, fetcher, now)
    indexability = indexabilityOf(result)
    phrases = phrasesFrom(html.get(result.finalUrl) ?? null, result.finalUrl)
  } catch {
    indexability = {
      state: 'unavailable',
      reason: 'The page could not be fetched to check its robots rules.',
    }
  }
  // Without phrases from the page, the core check tries to read the page
  // itself before it falls back to site: alone.
  const search = await searchGoogle(env, url, phrases, country)
  return {
    url,
    search,
    indexability,
    reading: readingOf(search, indexability),
  }
}

export async function checkIndex(
  env: Cloudflare.Env,
  input: IndexCheckerInput,
  now = new Date(),
): Promise<IndexCheckerResult> {
  const urls = input.urls.slice(0, INDEX_CHECKER_LIMITS.urls)
  const pages: IndexCheckerPage[] = new Array(urls.length)
  let next = 0
  await Promise.all(
    Array.from(
      { length: Math.min(INDEX_CHECKER_LIMITS.concurrency, urls.length) },
      async () => {
        while (next < urls.length) {
          const index = next
          next += 1
          pages[index] = await checkPage(
            env,
            urls[index] as string,
            input.country,
            now,
          )
        }
      },
    ),
  )
  return {
    country: input.country,
    checkedAt: now.toISOString(),
    counts: {
      indexed: pages.filter((page) => page.search.verdict === 'indexed').length,
      notFound: pages.filter((page) => page.search.verdict === 'not_found')
        .length,
      unknown: pages.filter((page) => page.search.verdict === 'unknown').length,
    },
    pages,
  }
}

export function handleIndexChecker(
  request: Request,
  env: Cloudflare.Env,
): Promise<Response> {
  return handleProtectedTool(request, env, {
    tool: 'index-checker',
    providerDailyLimit: dailyLimit(env.DATAFORSEO_AI_DAILY_CENTS),
    allowLocalhostTurnstileForTests: allowLocalTurnstileTest(request),
    parse: parseIndexChecker,
    provider: (input) => checkIndex(env, input),
  })
}
