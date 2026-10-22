import type { LiveCheck } from './page-facts.js'
import { table } from './present.js'
import type { SitemapUrls } from './sitemap-urls.js'
import type { CommandDeps, IndexStatus } from './types.js'

// Google's page indexing reasons for a bounded set of known URLs. Search
// Console's Page indexing report has no API, so each URL goes through URL
// Inspection, then a live check. Each row is labelled from that evidence
// by the rules in labelOf. Rows sort by reason, then URL, so an agent can
// compare one week's result with the next. Nothing is kept between runs.

// URL Inspections in one run unless the person asks for more (CLI and
// local MCP only), set before any work starts. Never more than the quota
// left today, and never more than Google's daily limit.
export const INSPECT_LIMIT = 100
export const MAX_INSPECT_LIMIT = 2_000
const CONCURRENCY = 20
const REFERRING_KEPT = 10

export type IndexingLabel = 'fix' | 'check' | 'expected' | 'indexed'

export const LABELS: Record<IndexingLabel, string> = {
  fix: 'the evidence shows a fault on the site',
  check: 'a person should look; the evidence alone does not settle it',
  expected: 'the evidence shows the site works as built, nothing to fix',
  indexed: 'Google indexes it and the live check shows no fault',
}

export type IndexingSource =
  | 'lost_clicks'
  | 'home'
  | 'sitemap'
  | 'search_console'

export type IndexingRow = {
  // Google's own reason (coverageState), word for word.
  reason: string
  url: string
  label: IndexingLabel
  why: string
  verdict: string | null
  indexing: string | null
  // The URL's own live response, and where its redirects end.
  status: number | null
  redirects: string | null
  redirects_to: string | null
  final_url: string | null
  final_status: number | null
  // The canonical the final page declares, live.
  page_canonical: string | null
  user_canonical: string | null
  google_canonical: string | null
  in_sitemap: boolean
  referring_urls: string[]
  last_crawl: string | null
  // When URL Inspection returned this result, ISO.
  inspected_at: string
  page_fetch: string | null
  robots_txt: string | null
  crawled_as: string | null
  sources: IndexingSource[]
  live_error?: string
}

const AUTH_SEGMENTS = new Set([
  'account',
  'admin',
  'api',
  'auth',
  'cart',
  'checkout',
  'dashboard',
  'login',
  'logout',
  'my-account',
  'oauth',
  'sign-in',
  'signin',
  'wp-admin',
  'wp-login.php',
])

const bareHost = (url: string) => new URL(url).hostname.replace(/^www\./, '')
const sameSite = (a: string, b: string) => {
  try {
    return bareHost(a) === bareHost(b)
  } catch {
    return false
  }
}

// An http:// or host (www) variant of the same path.
function variantOf(url: string, target: string): string | null {
  const from = new URL(url)
  const to = new URL(target)
  if (from.pathname !== to.pathname || from.search !== to.search) return null
  if (!sameSite(url, target)) return null
  if (from.protocol !== to.protocol) return 'http:// variant'
  if (from.host !== to.host) return `host variant (${from.host})`
  return null
}

const samePath = (a: string, b: string) => {
  const [from, to] = [new URL(a), new URL(b)]
  return from.pathname === to.pathname && from.search === to.search
}

const authPath = (url: string) =>
  AUTH_SEGMENTS.has(new URL(url).pathname.split('/')[1]?.toLowerCase() ?? '')

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? '' : 's'}`

export type Evidence = {
  url: string
  status: IndexStatus
  live: LiveCheck
  inSitemap: boolean
  // Page URLs the sitemaps list, to recognise a declared target.
  sitemap: Set<string>
}

// The label for one inspected URL and why, from its evidence only.
export function labelOf(e: Evidence): { label: IndexingLabel; why: string } {
  const { url, status, live } = e
  const { first, hops, last } = live
  const indexed = status.verdict === 'PASS'
  const coverage = status.coverage ?? ''
  // Pages on this site that Google saw linking here, not counting this
  // URL's own http:// or www variants.
  const referring = status.referring_urls.filter(
    (item) => item !== url && sameSite(item, url) && !samePath(item, url),
  )
  const pointers = [
    e.inSitemap ? 'the sitemap lists it' : null,
    referring.length
      ? `Google lists ${plural(referring.length, 'referring page')} on this site as of its last crawl (${referring[0]}${referring.length > 1 ? ', and more' : ''})`
      : null,
  ].filter(Boolean)

  if (first.error) {
    return indexed
      ? {
          label: 'indexed',
          why: `Google indexes it. The live check failed (${first.error}).`,
        }
      : {
          label: 'check',
          why: `The live check failed (${first.error}), so only Google's reason is shown.`,
        }
  }
  const temporary = hops.find(
    (hop) =>
      hop.kind === 'temporary' &&
      new URL(hop.from).host === new URL(hop.to).host,
  )
  if (temporary) {
    return {
      label: 'fix',
      why: `${temporary.from} sends a ${temporary.status} (temporary) redirect to ${temporary.to} on the same host; a permanent move uses 301 or 308.`,
    }
  }
  if (!last) {
    return {
      label: 'fix',
      why: `The redirects loop or pass 5 hops (${hops.map((hop) => hop.status).join(' > ')}).`,
    }
  }
  if (last.error) {
    return {
      label: 'check',
      why: `It redirects to ${last.url}, which could not be fetched (${last.error}).`,
    }
  }
  const end = last.status ?? 0
  const now = hops.length
    ? `redirects to ${last.url}, which returns ${end}`
    : `returns ${end} now`
  const via = `It ${now}`

  if (end === 404 || end === 410) {
    if (pointers.length) {
      return { label: 'fix', why: `${via}, and ${pointers.join(' and ')}.` }
    }
    if (hops.length) {
      return { label: 'fix', why: `${via}: a redirect to a missing page.` }
    }
    return {
      label: 'expected',
      why: `${via}, and neither the sitemap nor any referring page Google lists on this site points to it.`,
    }
  }

  if ((end === 401 || end === 403) && !hops.length) {
    if (e.inSitemap) {
      return { label: 'fix', why: `${via}, but the sitemap lists it.` }
    }
    if (end === 401 && first.www_authenticate) {
      return {
        label: 'expected',
        why: `${via} with a WWW-Authenticate header (${first.www_authenticate.split(/\s/)[0]}), so the server asks for sign-in here.`,
      }
    }
    if (authPath(url)) {
      return {
        label: 'expected',
        why: `${via} on a path that looks like a sign-in area (heuristic: from the path only).`,
      }
    }
    return {
      label: 'check',
      why: `${via} with no WWW-Authenticate header and no sign-in path, so the evidence does not show whether it should be public.`,
    }
  }

  if (hops.length) {
    const codes = hops.map((hop) => hop.status).join(' > ')
    if (end !== 200) {
      return { label: 'check', why: `${via} (${codes}).` }
    }
    if (e.inSitemap) {
      return {
        label: 'fix',
        why: `The sitemap lists it, but it redirects (${codes}) to ${last.url}.`,
      }
    }
    const declared =
      last.canonical === last.url
        ? 'declares itself canonical'
        : e.sitemap.has(last.url)
          ? 'is in the sitemap'
          : null
    const variant = variantOf(url, last.url)
    const moved = `${variant ? `An ${variant}` : 'A permanent redirect'}: ${codes} to ${last.url}`
    const stale = indexed
      ? ' Google still indexes this URL as of its last crawl.'
      : ''
    const links = referring.length ? ` ${pointers.at(-1)}.` : ''
    if (declared) {
      return {
        label: 'expected',
        why: `${moved}, which returns 200 and ${declared}.${stale}${links}`,
      }
    }
    return {
      label: 'check',
      why: `${moved}, which declares ${last.canonical ? `${last.canonical} as canonical` : 'no canonical'}.${stale}${links}`,
    }
  }

  if (
    /^(Crawled|Discovered) - currently not indexed$|^URL is unknown to Google$/i.test(
      coverage,
    )
  ) {
    const known = coverage.startsWith('Crawled')
      ? 'Google crawled it but has not indexed it, and gives no further reason'
      : coverage.startsWith('Discovered')
        ? 'Google knows the URL but has not crawled it yet'
        : 'Google has no record of this URL'
    return {
      label: 'check',
      why: `${known}.${e.inSitemap ? ' The sitemap lists it.' : ''} It returns ${end} now.`,
    }
  }
  const robots = last.robots
    ? ` with robots "${last.robots}"`
    : ' with no robots meta tag or X-Robots-Tag header'
  if (/noindex/i.test(coverage) && !/noindex/i.test(last.robots ?? '')) {
    return {
      label: 'check',
      why: `Google saw noindex when it last crawled${status.last_crawl ? ` (${status.last_crawl.slice(0, 10)})` : ''}, but it ${now}${robots}, so Google's reason may be out of date.${e.inSitemap ? ' The sitemap lists it.' : ''}`,
    }
  }
  const declaredCanonical = status.user_canonical ?? last.canonical
  if (
    status.google_canonical &&
    declaredCanonical &&
    status.google_canonical !== declaredCanonical
  ) {
    return {
      label: 'check',
      why: `Google chose ${status.google_canonical} as canonical; the page declares ${declaredCanonical}.`,
    }
  }
  if (indexed) {
    return end === 200
      ? { label: 'indexed', why: 'Google indexes it and it returns 200 now.' }
      : { label: 'check', why: `Google indexes it, but it ${now}.` }
  }
  if (e.inSitemap) {
    return {
      label: 'fix',
      why: `The sitemap lists it, but Google does not index it. It ${now}${robots}.`,
    }
  }
  if (
    status.google_canonical &&
    status.google_canonical === status.user_canonical &&
    status.google_canonical !== url
  ) {
    return {
      label: 'expected',
      why: `The page declares ${status.user_canonical} as canonical and Google uses it.`,
    }
  }
  return {
    label: 'check',
    why: /noindex/i.test(last.robots ?? '')
      ? `${via}${robots} and the sitemap does not list it. Whether it should be indexed is the site's call.`
      : `${via}${robots}. No rule here settles this reason.`,
  }
}

export function indexingRow(
  e: Evidence,
  sources: IndexingSource[],
  inspectedAt: string,
): IndexingRow {
  const { status, live } = e
  const { label, why } = labelOf(e)
  return {
    reason: status.coverage ?? status.verdict ?? 'No reason returned',
    url: e.url,
    label,
    why,
    verdict: status.verdict,
    indexing: status.indexing,
    status: live.first.status,
    redirects: live.hops.length
      ? live.hops.map((hop) => `${hop.status} ${hop.kind}`).join(' > ')
      : null,
    redirects_to: live.first.redirects_to,
    final_url: live.last?.url ?? null,
    final_status: live.last?.status ?? null,
    page_canonical: live.last?.canonical ?? null,
    user_canonical: status.user_canonical,
    google_canonical: status.google_canonical,
    in_sitemap: e.inSitemap,
    referring_urls: status.referring_urls.slice(0, REFERRING_KEPT),
    last_crawl: status.last_crawl,
    inspected_at: inspectedAt,
    page_fetch: status.page_fetch,
    robots_txt: status.robots_txt,
    crawled_as: status.crawled_as,
    sources,
    ...(live.first.error ? { live_error: live.first.error } : {}),
  }
}

// Code-point order, so every machine sorts the same way.
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

export function sortRows(rows: IndexingRow[]): IndexingRow[] {
  return [...rows].sort(
    (a, b) => byText(a.reason, b.reason) || byText(a.url, b.url),
  )
}

export function byReason(rows: IndexingRow[]) {
  const groups = new Map<string, Record<IndexingLabel, number>>()
  for (const row of rows) {
    const counts = groups.get(row.reason) ?? {
      fix: 0,
      check: 0,
      expected: 0,
      indexed: 0,
    }
    counts[row.label] += 1
    groups.set(row.reason, counts)
  }
  return [...groups]
    .sort((a, b) => byText(a[0], b[0]))
    .map(([reason, counts]) => ({
      reason,
      urls: counts.fix + counts.check + counts.expected + counts.indexed,
      ...counts,
    }))
}

const isCode = (error: unknown, codes: string[]) =>
  codes.includes(String((error as { code?: unknown } | null)?.code))

export type KnownUrls = {
  // In priority order: they are inspected in this order up to the limit.
  urls: { url: string; sources: IndexingSource[] }[]
  sitemap: SitemapUrls
  searchConsole: number
  searchConsoleCapped: boolean
  lostClicks: number
}

// Known URLs in the fixed order they are inspected: lost-click pages,
// Search Console pages by clicks then impressions, sitemap URLs in sitemap
// order, then the rest (the home page). The same input always gives the
// same order, so a run of N inspects the same first N URLs each time.
export function knownUrls(input: {
  lost: string[]
  home: string | null
  sitemap: SitemapUrls
  pages: { url: string; clicks: number; impressions: number }[]
  pagesCapped: boolean
}): KnownUrls {
  const found = new Map<string, IndexingSource[]>()
  const add = (url: string, source: IndexingSource) => {
    const sources = found.get(url) ?? []
    if (!sources.includes(source)) sources.push(source)
    found.set(url, sources)
  }
  const pages = input.pages
    .filter((page) => page.impressions > 0 && !page.url.includes('#'))
    .sort(
      (a, b) =>
        b.clicks - a.clicks ||
        b.impressions - a.impressions ||
        byText(a.url, b.url),
    )
  for (const url of input.lost) add(url, 'lost_clicks')
  for (const page of pages) add(page.url, 'search_console')
  for (const url of input.sitemap.urls) add(url, 'sitemap')
  if (input.home) add(input.home, 'home')
  return {
    urls: [...found].map(([url, sources]) => ({ url, sources })),
    sitemap: input.sitemap,
    searchConsole: pages.length,
    searchConsoleCapped: input.pagesCapped,
    lostClicks: input.lost.length,
  }
}

export type IndexingRun = {
  rows: IndexingRow[]
  statuses: Map<string, IndexStatus>
  known: KnownUrls
  // How many URLs this run covers at most.
  limit: number
  // URLs with a result: inspected now or from a fresh saved result.
  inspected: number
  fromSaved: number
  // When the oldest saved result used was inspected, ISO.
  oldestSaved: string | null
  failed: { url: string; error: string }[]
  stoppedBy: 'limit' | 'quota' | null
  quota: { used: number; limit: number } | null
}

// Inspects known URLs in order up to the limit (and the quota left on
// surfaces that count it), each with a live check.
export async function inspectKnown(
  site: string,
  known: KnownUrls,
  deps: CommandDeps,
  // How many URLs to cover; INSPECT_LIMIT unless the person asked for more.
  asked = INSPECT_LIMIT,
): Promise<IndexingRun> {
  const cap = Math.min(Math.max(1, Math.floor(asked)), MAX_INSPECT_LIMIT)
  const wanted = known.urls.slice(0, cap)
  // Fresh saved results cover their URLs, so only missing or stale URLs
  // are inspected, in the same order.
  let saved = new Map<string, { status: IndexStatus; inspectedAt: string }>()
  try {
    saved =
      deps.savedInspections?.read(
        site,
        wanted.map((item) => item.url),
      ) ?? saved
  } catch {}
  const missing = wanted.filter((item) => !saved.has(item.url))
  const quota = deps.inspectionQuota
    ? await deps.inspectionQuota(site).catch(() => null)
    : null
  const left = quota ? Math.max(0, quota.limit - quota.used) : missing.length
  const asking = new Set(missing.slice(0, left).map((item) => item.url))
  const queue = wanted.filter(
    (item) => saved.has(item.url) || asking.has(item.url),
  )
  // The quota left is below what this run would inspect.
  const quotaShort = left < missing.length
  const statuses = new Map<string, IndexStatus>()
  const rows: IndexingRow[] = []
  const failed: IndexingRun['failed'] = []
  const sitemap = new Set(known.sitemap.urls)
  const now = () => (deps.now?.() ?? new Date()).toISOString()
  let quotaStop = false
  let next = 0
  let fatal: unknown = null
  const worker = async () => {
    while (fatal === null && next < queue.length) {
      const item = queue[next++] as KnownUrls['urls'][number]
      const stored = saved.get(item.url)
      let status: IndexStatus
      let inspectedAt: string
      if (stored) {
        status = stored.status
        inspectedAt = stored.inspectedAt
      } else {
        if (quotaStop) continue
        try {
          status = await deps.inspect(site, item.url)
          inspectedAt = now()
        } catch (error) {
          if (isCode(error, ['RATE_LIMITED'])) {
            quotaStop = true
          } else if (
            isCode(error, ['AUTH_EXPIRED', 'AUTH_REQUIRED', 'NOT_CONNECTED'])
          ) {
            fatal = error
          } else {
            failed.push({
              url: item.url,
              error: error instanceof Error ? error.message : String(error),
            })
          }
          continue
        }
        try {
          deps.savedInspections?.save(site, item.url, status)
        } catch {}
      }
      statuses.set(item.url, status)
      const live = await deps.liveCheck(item.url)
      rows.push(
        indexingRow(
          {
            url: item.url,
            status,
            live,
            inSitemap: item.sources.includes('sitemap'),
            sitemap,
          },
          item.sources,
          inspectedAt,
        ),
      )
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  if (fatal !== null) throw fatal
  const reused = rows.filter((row) => saved.has(row.url))
  const oldest = reused.reduce<string | null>(
    (first, row) =>
      first === null || row.inspected_at < first ? row.inspected_at : first,
    null,
  )
  return {
    rows: sortRows(rows),
    statuses,
    known,
    limit: cap,
    inspected: rows.length,
    fromSaved: reused.length,
    oldestSaved: oldest,
    failed: failed.sort((a, b) => byText(a.url, b.url)),
    stoppedBy:
      quotaStop || quotaShort
        ? 'quota'
        : known.urls.length > wanted.length
          ? 'limit'
          : null,
    quota,
  }
}

const n = (value: number) => value.toLocaleString('en-US')

function liveCell(row: IndexingRow): string {
  if (row.live_error) return `error: ${row.live_error}`
  if (!row.redirects) return String(row.status ?? '')
  return `${row.redirects.replace(/ (permanent|temporary)/g, '')} > ${row.final_status ?? 'loop'}`
}

// The text for the reasons section, with one page of rows.
export function indexingText(
  site: string,
  run: IndexingRun,
  page: {
    summary: boolean
    offset: number
    size: number
    more: (offset: number) => string
  },
  origin: string | null,
  // How to inspect more URLs on this surface, or null where it cannot.
  askMore: ((count: number) => string) | null,
  now: Date,
): string[] {
  const { known } = run
  const total = known.urls.length
  const notInspected = total - run.inspected - run.failed.length
  const sources = [
    `lost-click pages ${n(known.lostClicks)}`,
    `Search Console pages with impressions in the last 28 days ${n(known.searchConsole)}${known.searchConsoleCapped ? ', capped' : ''}`,
    `sitemap ${n(known.sitemap.urls.length)} from ${plural(known.sitemap.files, 'file')}${known.sitemap.partial ? ', partial' : ''}`,
  ]
  const lowerBound =
    known.sitemap.partial || known.searchConsoleCapped ? ' at least' : ''
  // The most a next run could cover: this run's URLs (saved now) plus the
  // quota left after this run, within the known URLs.
  const asked = run.inspected - run.fromSaved
  const most = Math.min(
    total,
    MAX_INSPECT_LIMIT,
    run.quota
      ? run.inspected + run.quota.limit - run.quota.used - asked
      : MAX_INSPECT_LIMIT,
  )
  const days = run.oldestSaved
    ? Math.floor((now.getTime() - Date.parse(run.oldestSaved)) / 86_400_000)
    : 0
  const savedNote = run.fromSaved
    ? ` (${n(asked)} asked of Google now, ${n(run.fromSaved)} from saved results; the oldest was inspected ${run.oldestSaved?.slice(0, 16).replace('T', ' ')} UTC, ${days === 0 ? 'under a day' : plural(days, 'day')} ago. Saved results are reused for 7 days)`
    : ''
  const stop =
    run.stoppedBy === 'quota'
      ? 'The URL Inspection quota stopped it.'
      : run.stoppedBy === 'limit'
        ? `It stopped at ${n(run.limit)}, the number of inspections for this run${
            askMore && most > run.limit
              ? `; to inspect more, up to the quota left today: ${askMore(most)}`
              : ''
          }.`
        : 'Every known URL has a result.'
  const lines = [
    `Google's indexing reasons for ${site}, from URL Inspection. Search Console's Page indexing report has no API, so known URLs are inspected one at a time, in a fixed order (lost-click pages, Search Console pages by clicks then impressions, sitemap URLs, then the rest), and checked live from here.`,
    `Known URLs:${lowerBound} ${n(total)} (${sources.join('; ')}). Inspected ${n(run.inspected)} of ${n(total)}${savedNote}. ${stop}${notInspected > 0 ? ` The ${n(notInspected)} URLs not inspected have no result here, so this is not an all-clear for them.` : ''}${known.sitemap.notes.length ? ` Sitemap: ${known.sitemap.notes.join('; ')}.` : ''}`,
    run.quota
      ? `URL Inspection quota: this machine had used ${n(run.quota.used)} of ${n(run.quota.limit)} today for this property before the run. Google also counts inspections from other tools.`
      : 'URL Inspection quota: not counted on this server; Google stops inspections at 2,000 a day per property.',
  ]
  if (run.failed.length) {
    lines.push(
      `URL Inspection failed for ${plural(run.failed.length, 'URL')}: ${run.failed
        .slice(0, 5)
        .map((item) => `${item.url} (${item.error})`)
        .join('; ')}${run.failed.length > 5 ? '; and more' : ''}.`,
    )
  }
  const groups = byReason(run.rows)
  if (groups.length) {
    lines.push(
      `By Google's reason, with labels from the rules below (not Google's):\n${table(groups, ['reason', 'urls', 'fix', 'check', 'expected', 'indexed'], null)}`,
    )
  }
  // The summary shows the rows to act on or look at; rows pages through
  // every row that is not indexed with no fault, expected rows included.
  const listed = run.rows.filter((row) => row.label !== 'indexed')
  const shown = page.summary
    ? listed.filter((row) => row.label === 'fix' || row.label === 'check')
    : listed
  const indexedCount = run.rows.length - listed.length
  const expectedCount = listed.length - shown.length
  const pageRows = shown
    .slice(page.offset, page.offset + page.size)
    .map((row) => ({
      reason: row.reason,
      label: row.label,
      url: row.url,
      live: liveCell(row),
      final_url: row.final_url === row.url ? '' : row.final_url,
      in_sitemap: row.in_sitemap ? 'yes' : 'no',
      last_crawl: row.last_crawl?.slice(0, 10) ?? '',
      why: row.why,
    }))
  const end = page.offset + pageRows.length
  const more = shown.length - end
  const others = page.summary
    ? [
        more ? `${more} more labelled fix or check` : null,
        expectedCount ? `${expectedCount} expected` : null,
        indexedCount
          ? `${indexedCount} indexed with no fault found (in the full result)`
          : null,
      ].filter(Boolean)
    : []
  if (page.summary && (more || expectedCount)) {
    others.push(`every row but the indexed ones: ${page.more(0)}`)
  }
  lines.push(
    `${
      shown.length === 0
        ? `No inspected URL is labelled ${page.summary ? 'fix or check' : 'fix, check or expected'}.`
        : `${page.summary ? 'URLs labelled fix or check' : 'URLs that are not indexed or show a fault'}, ${page.offset + 1} to ${end} of ${shown.length}:\n${table(pageRows, Object.keys(pageRows[0] ?? {}), origin, 400)}`
    }${others.length ? `\nNot listed here: ${others.join('; ')}.` : ''}`,
    `Labels: ${Object.entries(LABELS)
      .map(([label, text]) => `${label}, ${text}`)
      .join(
        '; ',
      )}. Rules: a same-host 302 or 307 is fix; a 404 or 410 that the sitemap or a referring page on this site points to is fix; a sitemap URL that redirects or that Google does not index is fix; a URL outside the sitemap (such as an http:// or host variant) that permanently redirects to a page declaring itself canonical is expected; a 401 with a WWW-Authenticate header is expected, and a 401 or 403 on a sign-in path is expected by heuristic; "Crawled - currently not indexed", "Discovered - currently not indexed" and a Google canonical that differs from the declared one are check. Referring pages are as of Google's last crawl. Live checks are server responses, so a browser-only HSTS "307 Internal Redirect" never shows here.`,
  )
  if (!page.summary && more) lines.push(`More rows: ${page.more(end)}.`)
  return lines
}
