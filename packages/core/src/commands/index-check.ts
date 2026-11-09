import { liveCheck } from './page-facts.js'
import {
  dataForSeoKeys,
  dataForSeoLanguage,
  dataForSeoMarket,
  dataForSeoTask,
} from './research-providers.js'
import { dataForSeoSerp } from './research-serp.js'
import { CommandError, type CommandResult } from './types.js'

// Is one URL in Google's index? Asks Google through DataForSEO's live SERP,
// on desktop and mobile: site:<url>, and an exact phrase from the page. When nothing matches a site: search, Google drops the
// filter and shows unrelated results; those count as no match, never as a
// ranking. Worker-safe.

export const INDEX_CHECK_PHRASES = 2
const DEVICES = ['desktop', 'mobile'] as const
const DEPTH = 10

type Result =
  | 'page'
  | 'unresolved'
  | 'other_pages'
  | 'fallback'
  | 'other_sites'
  | 'empty'

export type IndexCheckRow = {
  query: string
  device: (typeof DEVICES)[number]
  // page: the URL itself came back. unresolved: results from the site whose
  // page DataForSEO could not resolve (a Google redirect link). other_pages:
  // only other pages of the site. fallback: a site: search showed unrelated
  // sites, Google's answer when nothing matches. other_sites: the phrase
  // search showed only other sites. empty: no results. error: the search
  // failed after retries.
  result: Result | 'error'
  position: number | null
  rank_absolute: number | null
  results: number
  top_domains: string
  error: string | null
}

export type IndexVerdict = 'indexed' | 'not_found' | 'unknown'

const bare = (host: string) => host.toLowerCase().replace(/^www\./, '')

function key(url: string): string {
  try {
    const parsed = new URL(url)
    return `${bare(parsed.hostname)}${parsed.pathname.replace(/\/+$/, '')}`.toLowerCase()
  } catch {
    return ''
  }
}

// Google's breadcrumb, such as \"example.com › docs › flags\", as a page key.
// A shortened one (with \"...\") names no page.
function hintKey(hint: string): string | null {
  const parts = hint.split('›').map((part) => part.trim())
  if (!parts[0] || parts.some((part) => /^\.\.\.$|…/.test(part))) return null
  return `${bare(parts[0])}${parts.length > 1 ? `/${parts.slice(1).join('/')}` : ''}`.toLowerCase()
}

// The words of the page's H1, or its title without a brand suffix, as an
// exact phrase. Long ones are cut to 12 words.
function phraseFrom(text: string | null, words = 2): string | null {
  const cleaned = (text ?? '')
    .split(/\s+[|\u2013\u2014-]\s+/)[0]
    ?.replace(/["“”]/g, '')
    .trim()
  if (!cleaned || cleaned.split(/\s+/).length < words) return null
  return cleaned.split(/\s+/).slice(0, 12).join(' ')
}

export async function runIndexCheck(
  input: { url: string; phrases?: string[]; country?: string },
  headers: Headers,
): Promise<CommandResult> {
  let target: URL
  try {
    target = new URL(
      /^https?:\/\//i.test(input.url) ? input.url : `https://${input.url}`,
    )
  } catch {
    throw new CommandError(
      'INVALID_INPUT',
      'index_check needs a page URL as target.',
    )
  }
  const keys = dataForSeoKeys(headers)
  const country = input.country ?? 'us'
  const market = dataForSeoMarket(country, dataForSeoLanguage(country))
  const page = key(target.href)
  const host = bare(target.hostname)
  let phrases = (input.phrases ?? []).slice(0, INDEX_CHECK_PHRASES)
  let phraseSource = phrases.length ? 'given' : null
  if (!phrases.length) {
    const live = await liveCheck(target.href).catch(() => null)
    // The H1 or title, and the description's first sentence.
    const sentence =
      (live?.last?.description ?? '').split(/(?<=[.!?])\s/)[0] ?? ''
    const found = [
      phraseFrom(live?.last?.h1 ?? null) ??
        phraseFrom(live?.last?.title ?? null),
      phraseFrom(sentence.replace(/[.!?]$/, ''), 5),
    ].filter((phrase): phrase is string => Boolean(phrase))
    phrases = [...new Set(found)].slice(0, INDEX_CHECK_PHRASES)
    phraseSource = phrases.length
      ? 'the page’s H1 or title and its meta description'
      : null
  }
  const queries = [
    `site:${host}${target.pathname === '/' ? '' : target.pathname.replace(/\/+$/, '')}`,
    // A plain exact phrase: Google's results through DataForSEO drop a
    // site: filter as soon as a search term is added.
    ...phrases.map((phrase) => `"${phrase.replace(/"/g, '')}"`),
  ]
  const rows: IndexCheckRow[] = []
  let cost = 0
  for (const query of queries) {
    for (const device of DEVICES) {
      const row: IndexCheckRow = {
        query,
        device,
        result: 'empty',
        position: null,
        rank_absolute: null,
        results: 0,
        top_domains: '',
        error: null,
      }
      try {
        const done = await dataForSeoTask(
          keys,
          'v3/serp/google/organic/live/advanced',
          {
            ...market,
            keyword: query,
            depth: DEPTH,
            device,
          },
        )
        cost += done.cost
        const items =
          (done.result?.items as Record<string, unknown>[] | undefined) ?? []
        const results = dataForSeoSerp(query, items).rows
        row.results = results.length
        row.top_domains = [
          ...new Set(results.map((r) => String(r.domain ?? '?'))),
        ]
          .slice(0, 3)
          .join(', ')
        const onSite = results.filter((r) => {
          const domain = bare(String(r.domain ?? ''))
          return domain === host || domain.endsWith(`.${host}`)
        })
        const match = onSite.find(
          (r) =>
            (typeof r.url === 'string' && key(r.url) === page) ||
            (typeof r.url_hint === 'string' && hintKey(r.url_hint) === page),
        )
        if (match) {
          row.result = 'page'
          row.position =
            typeof match.position === 'number' ? match.position : null
          row.rank_absolute = Number(match.rank_absolute) || null
        } else if (
          onSite.some(
            (r) =>
              r.url === null &&
              (typeof r.url_hint !== 'string' ||
                hintKey(r.url_hint) === null ||
                hintKey(r.url_hint) === host),
          )
        ) {
          row.result = 'unresolved'
        } else if (onSite.length) {
          row.result = 'other_pages'
        } else if (results.length) {
          row.result = query.startsWith('site:') ? 'fallback' : 'other_sites'
        }
      } catch (error) {
        if (error instanceof CommandError && error.code === 'NO_KEY')
          throw error
        cost += (error as { cost?: number }).cost ?? 0
        row.result = 'error'
        row.error = (error as Error).message
      }
      rows.push(row)
    }
  }
  const has = (result: IndexCheckRow['result']) =>
    rows.some((row) => row.result === result)
  const verdict: IndexVerdict = has('page')
    ? 'indexed'
    : has('error') || has('unresolved')
      ? 'unknown'
      : 'not_found'
  const reason =
    verdict === 'indexed'
      ? `Google returned the page itself for ${rows.filter((row) => row.result === 'page').length} of ${rows.length} searches.`
      : verdict === 'unknown'
        ? has('error')
          ? `${rows.filter((row) => row.result === 'error').length} of ${rows.length} searches failed after retries, and none of the others returned the page. Ask again later.`
          : 'Google returned results from the site, but DataForSEO gave Google redirect links whose page it could not resolve, so they may or may not be this page.'
        : `None of ${rows.length} searches returned the page.${has('fallback') ? ' Where the site: search showed other sites, Google had dropped the filter because nothing matched; those are not rankings.' : ''} It may be missing from the index, or indexed without this text. Check it with URL Inspection (seo page or seo index) if the site is yours.`
  const usd = Math.round(cost * 10_000) / 10_000
  const lines = [
    `Index check for ${target.href} (${country}, desktop and mobile): ${verdict.replace('_', ' ')}.`,
    reason,
    phraseSource
      ? `Exact phrase from ${phraseSource}.`
      : 'No exact phrase: none was given and the page’s H1 and title could not be read, so only site: was asked.',
    '',
    ...rows.map(
      (row) =>
        `${row.device.padEnd(7)}  ${row.result}${row.position !== null ? ` (organic ${row.position}, absolute ${row.rank_absolute})` : ''}  ${row.query}${row.results ? `  [${row.results} results: ${row.top_domains}]` : ''}${row.error ? `  ${row.error}` : ''}`,
    ),
    '',
    'This asks Google search, not Search Console. Google can index a page and still not show it for a site: or phrase search, so not found is evidence, not proof.',
    `DataForSEO cost: $${usd}.`,
  ]
  return {
    text: lines.join('\n'),
    data: {
      provider: 'dataforseo',
      action: 'index_check',
      url: target.href,
      country,
      verdict,
      reason,
      phrases,
      checks: rows,
      costUsd: usd,
    },
  }
}
