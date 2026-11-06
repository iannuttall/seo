// Works out whether Google is allowed to index one URL: it follows the
// redirects, reads every robots rule on the final page (meta robots, meta
// googlebot and the X-Robots-Tag header) and tests robots.txt, because a
// page Google cannot crawl never shows Google its noindex.
import { redirectKind, sameTarget } from '@seo/core/commands'
import {
  parseRobotsTxt,
  testRobotsUrl,
} from '../../src/lib/robots-txt-validator.ts'
import {
  type PageSignals,
  type PageTrace,
  parsePublicUrl,
  type RobotsRule,
  readPageSignals,
  tracePage,
} from './page-signals.ts'
import { fetchRobotsTxt } from './robots-txt.ts'
import {
  readRequest,
  ToolFetchError,
  ToolInputError,
  ToolLimitError,
} from './serp-preview.ts'
import { isBrowserRequestFromSameSite, type SitemapFetcher } from './sitemap.ts'

const USER_AGENT =
  'SEO-Noindex-Checker/1.0 (+https://seoskill.dev/tools/noindex-checker)'
const ROBOTS_ORIGINS = 3

const JSON_HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
}

export type NoindexVerdict =
  | 'indexable'
  | 'noindex'
  | 'blocked'
  | 'blocked-noindex'
  | 'error-status'
  | 'redirect-failed'

export type NoindexCheck = {
  id: string
  level: 'pass' | 'warn' | 'fail' | 'info'
  message: string
  fix?: string
}

export type RobotsTxtState = {
  url: string
  state: 'allowed' | 'blocked' | 'no-file' | 'unknown'
  message: string
}

export type NoindexResult = {
  schema: 1
  checkedAt: string
  requestedUrl: string
  finalUrl: string
  status: number | null
  verdict: NoindexVerdict
  headline: string
  summary: string
  hops: Array<{
    url: string
    status: number
    location: string | null
    robotsHeader: string | null
    robotsTxt: RobotsTxtState['state'] | null
  }>
  robots: RobotsRule[]
  robotsTxt: RobotsTxtState | null
  canonical: {
    href: string | null
    header: string | null
    count: number
    relation: 'self' | 'other' | 'none'
  }
  google: { noindex: boolean; nofollow: boolean }
  bingNoindex: boolean
  platform: string | null
  checks: NoindexCheck[]
}

function jsonResponse(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: JSON_HEADERS })
}

async function robotsFor(
  hops: string[],
  fetcher: SitemapFetcher,
): Promise<Map<string, RobotsTxtState>> {
  const states = new Map<string, RobotsTxtState>()
  const origins = [...new Set(hops.map((url) => new URL(url).origin))].slice(
    0,
    ROBOTS_ORIGINS,
  )
  await Promise.all(
    origins.map(async (origin) => {
      const robotsUrl = `${origin}/robots.txt`
      let file: Awaited<ReturnType<typeof fetchRobotsTxt>> | undefined
      try {
        file = await fetchRobotsTxt(new URL(robotsUrl), fetcher)
      } catch {
        file = undefined
      }
      for (const url of hops.filter((hop) => hop.startsWith(`${origin}/`))) {
        if (!file || file.source.availability === 'uncertain') {
          states.set(url, {
            url: robotsUrl,
            state: 'unknown',
            message: file
              ? `${robotsUrl} returned HTTP ${file.source.status}, so it is not clear what Google may crawl. Google treats a server error on robots.txt as a reason to slow down or stop crawling the site.`
              : `${robotsUrl} could not be read.`,
          })
          continue
        }
        if (file.source.availability === 'no-rules') {
          states.set(url, {
            url: robotsUrl,
            state: 'no-file',
            message: `${robotsUrl} returned HTTP ${file.source.status}, which means no rules. Google may crawl everything.`,
          })
          continue
        }
        const test = testRobotsUrl(
          parseRobotsTxt(file.content),
          url,
          'Googlebot',
          origin,
        )
        states.set(url, {
          url: robotsUrl,
          state: test.verdict === 'blocked' ? 'blocked' : 'allowed',
          message:
            test.verdict === 'blocked' && test.rule
              ? `Line ${test.rule.line} of robots.txt, "${test.rule.directive}: ${test.rule.pattern}", blocks Googlebot from this URL.`
              : test.rule
                ? `Line ${test.rule.line}, "${test.rule.directive}: ${test.rule.pattern}", lets Googlebot crawl this URL.`
                : 'No robots.txt rule blocks Googlebot from this URL.',
        })
      }
    }),
  )
  return states
}

function platformOf(trace: PageTrace, signals: PageSignals): string | null {
  const generator = signals.generator?.toLowerCase() ?? ''
  if (generator.includes('wordpress')) return 'wordpress'
  if (generator.includes('webflow')) return 'webflow'
  if (generator.includes('wix')) return 'wix'
  if (generator.includes('squarespace')) return 'squarespace'
  if (trace.headers.platform) return trace.headers.platform
  if (trace.html?.includes('/_next/static/')) return 'nextjs'
  return null
}

const META_FIX: Record<string, string> = {
  wordpress:
    'In WordPress, open Settings, then Reading, and untick "Discourage search engines from indexing this site". If that is already off, open the page in your SEO plugin (Yoast or Rank Math) and allow search engines to show it, then check the plugin\'s settings for this content type.',
  webflow:
    'In Webflow, open the page settings and turn on Sitemap indexing for this page, then publish.',
  shopify:
    'In Shopify, look for a conditional noindex in theme.liquid and for the seo.hidden metafield on this page or product. An Unlisted product is also hidden from search.',
  nextjs:
    'In Next.js, check the page metadata for robots: { index: false }. Next.js also adds a noindex tag to a page that calls notFound() after streaming starts, while the status stays 200.',
  wix: 'In Wix, open the page SEO settings and turn on "Let search engines index this page".',
  squarespace:
    'In Squarespace, open the page settings, then SEO, and turn off "Hide page from search results".',
}

const HEADER_FIX: Record<string, string> = {
  vercel:
    'Vercel adds X-Robots-Tag: noindex to preview deployments and to production deployments that are no longer current. Check the live production domain, not a preview URL.',
  netlify:
    'On Netlify, look for X-Robots-Tag in the _headers file or the headers section of netlify.toml.',
}

const GENERIC_META_FIX =
  'Remove noindex from the robots tag in the template that prints this page. You do not need to write "index": a page with no robots tag can be indexed.'
const GENERIC_HEADER_FIX =
  "The X-Robots-Tag header is set by the server, the CDN or the framework, not the HTML. Look in .htaccess, the nginx or Apache config, a CDN rule, or your framework's headers setting."

function ruleLabel(rule: RobotsRule): string {
  if (rule.source === 'header') {
    return rule.name
      ? `X-Robots-Tag header for ${rule.name}`
      : 'X-Robots-Tag header'
  }
  return `<meta name="${rule.name}">`
}

function ruleMeaning(rule: RobotsRule): string {
  if (rule.audience === 'other') {
    return `Google ignores this. It is for ${rule.name} only.`
  }
  if (rule.audience === 'bing') return 'Bing reads this. Google ignores it.'
  if (rule.audience === 'google-news') {
    return 'This applies to Google News only, not to Google Search.'
  }
  const who =
    rule.audience === 'google' ? 'Googlebot only' : 'every search engine'
  if (rule.directives.includes('noindex')) {
    return `Tells ${who} not to index this page.`
  }
  if (rule.directives.includes('nofollow')) {
    return `Tells ${who} not to follow the links on this page. The page can still be indexed.`
  }
  return `Applies to ${who}. Nothing in it stops indexing.`
}

export function noindexChecks(
  trace: PageTrace,
  signals: PageSignals,
  robots: Map<string, RobotsTxtState>,
  platform: string | null,
): {
  verdict: NoindexVerdict
  headline: string
  summary: string
  checks: NoindexCheck[]
} {
  const checks: NoindexCheck[] = []
  const finalRobots = robots.get(trace.finalUrl)
  const redirects = trace.hops.slice(0, -1)
  const status = trace.finalStatus

  if (trace.outcome !== 'done') {
    const what =
      trace.outcome === 'loop'
        ? 'The redirects loop back to a URL they already visited, so no page is ever reached.'
        : trace.outcome === 'too_many'
          ? "The URL redirected more than 10 times without reaching a page. Google's crawler stops after 10 hops."
          : (trace.error ?? 'The page could not be fetched.')
    checks.push({
      id: 'redirect-failed',
      level: 'fail',
      message: what,
      fix:
        trace.outcome === 'loop' || trace.outcome === 'too_many'
          ? 'Point the first URL straight at the final page with one 301 redirect.'
          : undefined,
    })
    return {
      verdict: 'redirect-failed',
      headline:
        trace.outcome === 'loop'
          ? 'Redirect loop'
          : trace.outcome === 'too_many'
            ? 'Too many redirects'
            : 'The page did not load',
      summary: 'Google cannot index a page it cannot reach.',
      checks,
    }
  }

  if (redirects.length) {
    const temporary = redirects.filter(
      (hop) => redirectKind(hop.status) === 'temporary',
    )
    checks.push({
      id: 'redirects',
      level: temporary.length ? 'warn' : 'info',
      message: `The URL you entered redirects ${redirects.length === 1 ? 'once' : `${redirects.length} times`} to ${trace.finalUrl}. Google indexes the final page, so the checks below are for that page.${temporary.length ? ` ${temporary.length === redirects.length ? (redirects.length === 1 ? 'It is' : 'All of them are') : `${temporary.length} of them ${temporary.length === 1 ? 'is' : 'are'}`} temporary (${[...new Set(temporary.map((hop) => hop.status))].join(', ')}), so Google may keep the original URL in its index.` : ''}`,
      fix: temporary.length
        ? 'If the move is permanent, use a 301 or 308 redirect.'
        : undefined,
    })
    const blockedHop = redirects.find(
      (hop) => robots.get(hop.url)?.state === 'blocked',
    )
    if (blockedHop) {
      checks.push({
        id: 'redirect-blocked',
        level: 'fail',
        message: `robots.txt blocks Googlebot from ${blockedHop.url}, so Google never sees that it redirects.`,
        fix: 'Allow the old URL in robots.txt so Google can follow the redirect.',
      })
    }
  }

  if (status !== 200) {
    const gone = status === 404 || status === 410
    // Many sites refuse unknown bots and still serve Googlebot, so a refusal
    // here says nothing certain about what Google gets.
    const refused = status === 401 || status === 403 || status === 429
    checks.push({
      id: 'status',
      level: refused ? 'warn' : 'fail',
      message: gone
        ? `The page returns ${status}. Google drops pages that return ${status}, with or without a noindex.`
        : refused
          ? `The server refused this checker with ${status}. Many sites block unknown bots and still let Googlebot in, so this may not be what Google gets.`
          : status && status >= 500
            ? `The page returns ${status}, a server error. Google retries for a while, then drops pages that keep failing.`
            : `The page returns ${status}. Google indexes only pages that return 200.`,
      fix: gone
        ? 'If the page should be in Google, fix the URL or restore the page. If it moved, redirect it with a 301.'
        : refused
          ? 'Check the page with URL Inspection in Search Console, which fetches it as Googlebot.'
          : undefined,
    })
    return {
      verdict: 'error-status',
      headline: refused
        ? `The server refused the check (${status})`
        : `The page returns ${status}`,
      summary: gone
        ? 'This URL is not a page Google can index, so noindex does not matter here.'
        : refused
          ? 'The server would not show this checker the page, so its robots rules could not be read.'
          : 'Google indexes pages that return 200. Fix the status first.',
      checks,
    }
  }

  checks.push({
    id: 'status',
    level: 'pass',
    message: `The page returns 200${trace.contentType ? ` (${trace.contentType})` : ''}.`,
  })

  const blocked = finalRobots?.state === 'blocked'
  const noindex = signals.google.noindex

  if (finalRobots) {
    checks.push({
      id: 'robots-txt',
      level: blocked
        ? 'fail'
        : finalRobots.state === 'unknown'
          ? 'warn'
          : 'pass',
      message: blocked
        ? `${finalRobots.message} Google cannot crawl the page, so it never sees any noindex on it. The URL can still show in results, without a description, if other pages link to it.`
        : finalRobots.message,
      fix: blocked
        ? noindex
          ? 'To keep the page out of Google, remove the robots.txt rule so Google can crawl it and see the noindex. Block it in robots.txt only after it has dropped out.'
          : 'If the page should be in Google, remove the rule. If it should stay out, allow crawling and add a noindex instead: a robots.txt block alone does not keep a URL out of the index.'
        : undefined,
    })
  }

  const googleRules = signals.robots.filter(
    (rule) => rule.audience === 'all' || rule.audience === 'google',
  )
  const otherRules = signals.robots.filter(
    (rule) => !(rule.audience === 'all' || rule.audience === 'google'),
  )
  if (!googleRules.length) {
    checks.push({
      id: 'no-robots-rules',
      level: 'pass',
      message:
        'No robots meta tag and no X-Robots-Tag header for Google. With no rule, Google may index the page.',
    })
  }
  for (const rule of googleRules) {
    const isNoindex = rule.directives.includes('noindex')
    checks.push({
      id: `rule-${rule.source}-${rule.name || 'all'}`,
      level: isNoindex ? 'fail' : 'pass',
      message: `${ruleLabel(rule)}: "${rule.value}". ${ruleMeaning(rule)}${rule.source === 'meta' && !rule.inHead ? ' This tag is outside the head. Google asks for it in the head, but treat it as live until it is gone.' : ''}`,
      fix: isNoindex
        ? rule.source === 'header'
          ? ((platform && HEADER_FIX[platform]) ?? GENERIC_HEADER_FIX)
          : ((platform && META_FIX[platform]) ?? GENERIC_META_FIX)
        : undefined,
    })
  }
  if (signals.google.unavailableAfter) {
    const { raw, passed } = signals.google.unavailableAfter
    checks.push({
      id: 'unavailable-after',
      level: passed ? 'fail' : 'info',
      message: passed
        ? `unavailable_after: ${raw} has passed, so Google treats the page as noindex.`
        : Number.isFinite(Date.parse(raw))
          ? `unavailable_after: ${raw}. Google stops showing the page after that date.`
          : `unavailable_after: ${raw} is not a date Google can read, so Google ignores the rule.`,
      fix: passed
        ? 'Remove the unavailable_after rule or set a later date.'
        : undefined,
    })
  }
  for (const rule of otherRules) {
    checks.push({
      id: `rule-${rule.source}-${rule.name}`,
      level: 'info',
      message: `${ruleLabel(rule)}: "${rule.value}". ${ruleMeaning(rule)}`,
    })
  }

  const canonical = signals.canonical.href ?? signals.canonical.header
  if (canonical && !sameTarget(canonical, trace.finalUrl)) {
    checks.push({
      id: 'canonical',
      level: noindex ? 'warn' : 'info',
      message: noindex
        ? `The canonical points to ${canonical}, and the page also says noindex. The two ask for different things: noindex says leave this page out, the canonical says index that other URL instead.`
        : `The canonical points to ${canonical}. Google may index that URL instead of this one.`,
      fix: noindex
        ? 'Pick one. For a duplicate, keep the canonical and drop the noindex. For a page that should not be in Google at all, keep the noindex and point the canonical at the page itself or remove it.'
        : undefined,
    })
  }
  if (signals.metaRefresh) {
    checks.push({
      id: 'meta-refresh',
      level: 'info',
      message: `The page has a meta refresh after ${signals.metaRefresh.seconds} seconds${signals.metaRefresh.url ? ` to ${signals.metaRefresh.url}` : ''}. Google treats an instant refresh as a permanent redirect and a delayed one as temporary.`,
    })
  }
  if (trace.html !== null) {
    checks.push({
      id: 'javascript',
      level: 'info',
      message:
        'This reads the HTML your server sends, before JavaScript runs. If a script adds noindex later, Google can still see it when it renders the page. If the HTML already says noindex, Google may skip rendering, so a script that removes it may not work.',
    })
  }

  const verdict: NoindexVerdict = blocked
    ? noindex
      ? 'blocked-noindex'
      : 'blocked'
    : noindex
      ? 'noindex'
      : 'indexable'
  const source = googleRules.find((rule) => rule.directives.includes('noindex'))
  return {
    verdict,
    headline:
      verdict === 'indexable'
        ? 'No noindex found'
        : verdict === 'noindex'
          ? 'Noindex found'
          : verdict === 'blocked-noindex'
            ? 'Noindex found, but Google cannot see it'
            : 'Blocked by robots.txt',
    summary:
      verdict === 'indexable'
        ? 'Google is allowed to index this page. Whether it does is up to Google.'
        : verdict === 'noindex'
          ? `Google will drop this page from its results the next time it crawls it${source ? `, because of the ${ruleLabel(source)}` : signals.google.unavailableAfter?.passed ? ', because its unavailable_after date has passed' : ''}.`
          : verdict === 'blocked-noindex'
            ? 'robots.txt stops Google crawling the page, so the noindex is never read and the URL can stay in Google.'
            : 'Google cannot crawl this page. It can still index the URL from links, without reading the page.',
    checks,
  }
}

export async function checkNoindex(
  pageUrl: URL,
  requestedUrl: string,
  fetcher: SitemapFetcher = fetch,
  now = new Date(),
): Promise<NoindexResult> {
  const trace = await tracePage(pageUrl, fetcher, {
    userAgent: USER_AGENT,
    readBody: true,
  })
  const signals = readPageSignals(
    trace.html,
    trace.finalUrl,
    trace.headers,
    now,
  )
  const hopUrls = trace.hops.map((hop) => hop.url)
  const robots =
    trace.outcome === 'done' ? await robotsFor(hopUrls, fetcher) : new Map()
  const platform = platformOf(trace, signals)
  const outcome = noindexChecks(trace, signals, robots, platform)
  const canonical = signals.canonical.href ?? signals.canonical.header
  return {
    schema: 1,
    checkedAt: now.toISOString(),
    requestedUrl,
    finalUrl: trace.finalUrl,
    status: trace.finalStatus,
    ...outcome,
    hops: trace.hops.map((hop) => ({
      ...hop,
      robotsTxt: robots.get(hop.url)?.state ?? null,
    })),
    robots: signals.robots,
    robotsTxt: robots.get(trace.finalUrl) ?? null,
    canonical: {
      href: signals.canonical.href,
      header: signals.canonical.header,
      count: signals.canonical.count,
      relation: !canonical
        ? 'none'
        : sameTarget(canonical, trace.finalUrl)
          ? 'self'
          : 'other',
    },
    google: {
      noindex: signals.google.noindex,
      nofollow: signals.google.nofollow,
    },
    bingNoindex: signals.bingNoindex,
    platform,
  }
}

export async function handleNoindexCheck(
  request: Request,
  fetcher: SitemapFetcher = fetch,
): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }
  if (!isBrowserRequestFromSameSite(request)) {
    return jsonResponse({ error: 'Not found' }, 404)
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return jsonResponse({ error: 'Send a JSON request.' }, 400)
  }
  try {
    const body = await readRequest(request)
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).join() !== 'url'
    ) {
      throw new ToolInputError('Send only the page URL.')
    }
    const requestedUrl = (body as { url?: unknown }).url
    const pageUrl = parsePublicUrl(requestedUrl)
    return jsonResponse(
      await checkNoindex(pageUrl, String(requestedUrl).trim(), fetcher),
    )
  } catch (error) {
    if (error instanceof ToolInputError) {
      return jsonResponse({ error: error.message }, 400)
    }
    if (error instanceof ToolLimitError) {
      return jsonResponse({ error: error.message }, 413)
    }
    if (error instanceof ToolFetchError) {
      return jsonResponse({ error: error.message }, 422)
    }
    return jsonResponse({ error: 'The page could not be checked.' }, 503)
  }
}
