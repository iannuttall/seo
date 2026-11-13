import type { Detail } from './present.js'
import { dataForSeoKeys, dataForSeoTask } from './research-providers.js'
import { PAGE_SIZE, rowsText } from './rows.js'
import { CommandError, type CommandResult } from './types.js'

// Pages on other sites that name a site or its brand, from DataForSEO's
// content index, and whether each of those sites already links to it, from
// DataForSEO's backlink index. One page per site. Worker-safe.

export const MENTION_TERMS = 4
const PER_TERM = 100
const SNIPPET = 200

const bare = (host: string) => host.toLowerCase().replace(/^www\./, '')

type Mention = {
  site: string
  url: string
  title: string | null
  snippet: string | null
  matched: string
  domain_rank: number | null
  fetched: string | null
  links: 'yes' | 'not_found'
}

const text = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : null

export async function runMentions(
  input: {
    target: string
    brand?: string[]
    offset?: number
    detail?: Detail
  },
  headers: Headers,
): Promise<CommandResult> {
  const target = bare(
    input.target
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      ?.trim() ?? '',
  )
  if (!target.includes('.')) {
    throw new CommandError(
      'INVALID_INPUT',
      'mentions needs a domain as target, such as example.com.',
    )
  }
  const keys = dataForSeoKeys(headers)
  const terms = [
    ...new Set(
      [target, ...(input.brand ?? [])]
        .map((term) => term.replace(/"/g, '').trim().toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, MENTION_TERMS)
  const onTarget = (host: string) =>
    host === target || host.endsWith(`.${target}`)
  let cost = 0
  const found = new Map<string, Mention>()
  const capped: string[] = []
  for (const term of terms) {
    const done = await dataForSeoTask(keys, 'v3/content_analysis/search/live', {
      // An exact phrase, so example.com is not split into words.
      keyword: `"${term}"`,
      search_mode: 'one_per_domain',
      limit: PER_TERM,
    })
    cost += done.cost
    const items =
      (done.result?.items as Record<string, unknown>[] | undefined) ?? []
    if (Number(done.result?.total_count ?? 0) > items.length) capped.push(term)
    for (const item of items) {
      const site = bare(String(item.main_domain ?? item.domain ?? ''))
      const url = text(item.url)
      if (!site || !url || onTarget(bare(String(item.domain ?? site)))) continue
      if (found.has(site)) continue
      const info = (item.content_info ?? {}) as Record<string, unknown>
      const snippet = text(info.snippet)
      found.set(site, {
        site,
        url,
        title: text(info.main_title) ?? text(info.title),
        snippet: snippet
          ? snippet.length > SNIPPET
            ? `${snippet.slice(0, SNIPPET)}…`
            : snippet
          : null,
        matched: term,
        domain_rank:
          typeof item.domain_rank === 'number' ? item.domain_rank : null,
        fetched: text(item.fetch_time),
        links: 'not_found',
      })
    }
  }
  // Which of these sites link to the target at all, in one call.
  const sites = [...found.keys()]
  let linkCheck = 'none'
  if (sites.length) {
    try {
      const done = await dataForSeoTask(keys, 'v3/backlinks/backlinks/live', {
        target,
        mode: 'one_per_domain',
        filters: ['domain_from', 'in', sites.flatMap((s) => [s, `www.${s}`])],
        limit: 1000,
      })
      cost += done.cost
      const items =
        (done.result?.items as Record<string, unknown>[] | undefined) ?? []
      for (const item of items) {
        const from = bare(String(item.domain_from ?? ''))
        const mention =
          found.get(from) ??
          [...found.values()].find((m) => from.endsWith(`.${m.site}`))
        if (mention) mention.links = 'yes'
      }
      linkCheck = 'done'
    } catch (error) {
      cost += (error as { cost?: number }).cost ?? 0
      linkCheck = 'failed'
    }
  }
  // A page that names the domain is a sure mention; a brand name can be an
  // ordinary phrase, so its matches come after.
  const rows = [...found.values()].sort(
    (a, b) =>
      Number(a.matched !== target) - Number(b.matched !== target) ||
      Number(a.links === 'yes') - Number(b.links === 'yes') ||
      (b.domain_rank ?? -1) - (a.domain_rank ?? -1) ||
      a.site.localeCompare(b.site),
  )
  const unlinked = rows.filter((row) => row.links !== 'yes').length
  const named = rows.filter((row) => row.matched === target)
  const spent = Math.round(cost * 10_000) / 10_000
  const notes = [
    `Searched DataForSEO's content index for ${terms.map((t) => `"${t}"`).join(', ')}, one page per site, leaving out ${target} and its subdomains. DataForSEO cost: $${spent}.`,
    rows.length
      ? `${named.length} sites name ${target}, and ${named.filter((row) => row.links !== 'yes').length} of them have no link to it in DataForSEO's backlink index.${rows.length > named.length ? ` ${rows.length - named.length} more match only a brand name, ${unlinked - named.filter((row) => row.links !== 'yes').length} of them with no link found.` : ''}`
      : `No pages in DataForSEO's content index mention ${terms.join(' or ')}. That index is a sample of the web, so a mention it hasn't crawled won't show.`,
    ...(terms.length > 1
      ? [
          `Pages that name ${target} come first. A brand name that is also an ordinary phrase matches pages using the words, not the brand, so check those rows before you count them.`,
        ]
      : []),
    ...(capped.length
      ? [
          `More pages mention ${capped.join(', ')} than the ${PER_TERM} sites read per term, so the list is partial.`,
        ]
      : []),
    ...(linkCheck === 'failed'
      ? [
          'The backlink check failed, so links is not_found for every site: whether they link is unknown.',
        ]
      : []),
    "links: yes means DataForSEO has a link from that site to the target; not_found means it has none, which can also be a link it hasn't crawled, so check the page before you ask. A mention with no link is a site that already knows you: ask for the link, or for a correct one.",
    "domain_rank is DataForSEO's own authority score, not Ahrefs' Domain Rating.",
  ]
  return {
    text: rowsText({
      title: `Mentions of ${target}.`,
      rows,
      offset: input.offset ?? 0,
      limit: PAGE_SIZE,
      detail: input.detail ?? 'summary',
      notes,
    }),
    data: {
      provider: 'dataforseo',
      action: 'mentions',
      target,
      terms,
      costUsd: spent,
      partial: capped.length > 0,
      linkCheck,
      total: rows.length,
      unlinked,
      rows: rows.slice(input.offset ?? 0, (input.offset ?? 0) + PAGE_SIZE),
    },
  }
}
