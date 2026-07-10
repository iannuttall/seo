import type { CrawlPageSnapshot } from '../monitoring/types.js'
import type {
  CrawlAiBotAccess,
  CrawlAiResourceSignal,
  CrawlReport,
} from './report.js'

export type ReadinessStatus = 'pass' | 'warning' | 'fail' | 'unknown'

export type ReadinessCheck = {
  id: string
  section: string
  status: ReadinessStatus
  evaluated: boolean
  score: number
  maxScore: number
  title: string
  plainEnglish: string
  action: string
  evidence?: Record<string, unknown>
  urls?: string[]
}

export type ReadinessSection = {
  id: string
  title: string
  score: number
  maxScore: number
  checks: ReadinessCheck[]
}

export type AiReadinessReport = {
  reportId: string
  url: string
  generatedAt: string
  dataStatus: 'complete' | 'partial'
  score: number
  grade: 'excellent' | 'strong' | 'needs-work' | 'blocked'
  headline: string
  sections: ReadinessSection[]
  checks: ReadinessCheck[]
  topActions: ReadinessCheck[]
  botAccess: CrawlAiBotAccess[]
  agentResources: CrawlAiResourceSignal[]
  caveats: string[]
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((part / total) * 100)
}

function scoreFromPercent(value: number, maxScore: number): number {
  return Math.round((Math.max(0, Math.min(100, value)) / 100) * maxScore)
}

function status(score: number, maxScore: number): ReadinessStatus {
  const ratio = maxScore ? score / maxScore : 0
  if (ratio >= 0.85) return 'pass'
  if (ratio >= 0.5) return 'warning'
  return 'fail'
}

function section(
  id: string,
  title: string,
  checks: ReadinessCheck[],
): ReadinessSection {
  const maxScore = checks.reduce(
    (sum, check) => sum + (check.evaluated ? check.maxScore : 0),
    0,
  )
  const score = checks.reduce(
    (sum, check) => sum + (check.evaluated ? check.score : 0),
    0,
  )
  return { id, title, score, maxScore, checks }
}

function check(
  input: Omit<ReadinessCheck, 'status' | 'evaluated'> & {
    evaluated?: boolean
  },
): ReadinessCheck {
  const evaluated = input.evaluated ?? true
  return {
    ...input,
    evaluated,
    status: evaluated ? status(input.score, input.maxScore) : 'unknown',
  }
}

function indexablePages(report: CrawlReport): CrawlPageSnapshot[] {
  return report.pages.filter((page) => page.indexable && page.status < 400)
}

function sampleUrls(
  pages: CrawlPageSnapshot[],
  predicate: (page: CrawlPageSnapshot) => boolean,
): string[] {
  return pages
    .filter(predicate)
    .slice(0, 10)
    .map((page) => page.finalUrl)
}

function grade(score: number): AiReadinessReport['grade'] {
  if (score >= 90) return 'excellent'
  if (score >= 75) return 'strong'
  if (score >= 50) return 'needs-work'
  return 'blocked'
}

export function aiReadiness(report: CrawlReport): AiReadinessReport {
  const pages = indexablePages(report)
  const pageCount = pages.length || report.pages.length
  const botAccess = report.ai?.robotsTxt?.botAccess ?? []
  const blockedBots = botAccess.filter((bot) => bot.allowed === false)
  const unknownBots = botAccess.filter((bot) => bot.allowed === null)
  const robotsUnavailable =
    report.ai?.robotsTxt?.availability === 'rate-limited' ||
    report.ai?.robotsTxt?.availability === 'unreachable'
  const declaredBots = botAccess.filter(
    (bot) => bot.declared || bot.coveredByWildcard,
  )
  const detectedResources = report.ai?.agentResources?.filter(
    (resource) => resource.exists,
  )
  const jsonLdPages = report.pages.filter(
    (page) =>
      page.structuredDataFormats?.includes('json-ld') ||
      (page.invalidJsonLdCount ?? 0) > 0,
  )
  const invalidJsonLdPages = jsonLdPages.filter(
    (page) => (page.invalidJsonLdCount ?? 0) > 0,
  )
  const answerablePages = pages.filter((page) => page.geo?.answerable)
  const semanticPages = pages.filter((page) => page.geo?.semanticHtml)
  const titlePages = pages.filter((page) => page.title && page.h1)
  const metaPages = pages.filter((page) => page.metaDescription)
  const langPages = pages.filter((page) => page.lang)
  const entityPages = pages.filter(
    (page) =>
      page.schemaTypes?.some((type) =>
        /^(Organization|LocalBusiness|Person|Product|WebSite)$/i.test(type),
      ) ||
      (page.schemaSameAs?.length ?? 0) > 0 ||
      (page.socialProfileLinks?.length ?? 0) > 0,
  )
  const httpsPages = pages.filter((page) => page.isHttps)
  const viewportPages = pages.filter((page) => page.hasViewport)
  const readablePages = pages.filter((page) => (page.textRatio ?? 0) >= 0.05)

  const sections = [
    section('agent-access', 'Agent access', [
      check({
        id: 'robots-ai-bots',
        section: 'agent-access',
        maxScore: 20,
        evaluated: !robotsUnavailable,
        score: robotsUnavailable
          ? 0
          : botAccess.length
            ? blockedBots.length
              ? scoreFromPercent(
                  pct(botAccess.length - blockedBots.length, botAccess.length),
                  20,
                )
              : 20
            : 8,
        title: robotsUnavailable
          ? 'robots.txt access evidence is unavailable'
          : 'AI crawlers can fetch the site',
        plainEnglish: robotsUnavailable
          ? 'The robots.txt request failed, so this report cannot say whether known AI crawlers are allowed.'
          : blockedBots.length
            ? `${blockedBots.length} known AI crawler user agent is blocked in robots.txt.`
            : botAccess.length
              ? 'Known AI crawler user agents are not blocked at the start URL.'
              : 'This crawl does not include per-bot robots.txt data yet.',
        action: robotsUnavailable
          ? 'Restore a stable robots.txt response, then rerun this report before making crawler-access claims.'
          : blockedBots.length
            ? 'Only block AI crawlers intentionally. If discovery matters, remove accidental Disallow rules for the blocked user agents.'
            : 'Keep robots.txt explicit and intentional so humans and agents can see what is allowed.',
        evidence: {
          blockedBots,
          unknownBots,
          declaredBots: declaredBots.length,
          availability: report.ai?.robotsTxt?.availability,
          status: report.ai?.robotsTxt?.status,
          error: report.ai?.robotsTxt?.error,
        },
      }),
      check({
        id: 'robots-sitemap',
        section: 'agent-access',
        maxScore: 8,
        evaluated: !robotsUnavailable,
        score: robotsUnavailable
          ? 0
          : report.ai?.robotsTxt?.sitemapUrls.length
            ? 8
            : 3,
        title: 'robots.txt points agents to sitemaps',
        plainEnglish: robotsUnavailable
          ? 'The robots.txt response was unavailable, so sitemap declarations could not be checked.'
          : report.ai?.robotsTxt?.sitemapUrls.length
            ? 'robots.txt declares at least one sitemap URL.'
            : 'robots.txt does not declare a sitemap URL.',
        action: robotsUnavailable
          ? 'Restore robots.txt availability and rerun before evaluating sitemap declarations.'
          : 'Add a Sitemap line to robots.txt so crawlers can discover the full index quickly.',
        evidence: { sitemapUrls: report.ai?.robotsTxt?.sitemapUrls ?? [] },
      }),
      check({
        id: 'agent-resources',
        section: 'agent-access',
        maxScore: 7,
        score: detectedResources?.length ? 7 : 3,
        title: 'Agent descriptor files are discoverable',
        plainEnglish: detectedResources?.length
          ? `${detectedResources.length} machine-readable agent resource was found.`
          : 'No OpenAPI, MCP, ai-plugin, or agent descriptor file was found at the common locations.',
        action:
          'Publish useful descriptors only when they are real: OpenAPI for APIs, MCP metadata for tools, or agent.json for site capabilities.',
        evidence: { resources: report.ai?.agentResources ?? [] },
      }),
    ]),
    section('machine-readable', 'Machine-readable signals', [
      check({
        id: 'llms-txt',
        section: 'machine-readable',
        maxScore: 15,
        score: report.ai?.llmsTxt?.exists ? 15 : 3,
        title: 'llms.txt exists',
        plainEnglish: report.ai?.llmsTxt?.exists
          ? 'The site has an llms.txt file agents can use as a compact entry point.'
          : 'No llms.txt file was found.',
        action:
          'Generate an llms.txt from the crawl and keep it focused on the pages agents should read first.',
        evidence: { llmsTxt: report.ai?.llmsTxt },
      }),
      check({
        id: 'valid-json-ld',
        section: 'machine-readable',
        maxScore: 8,
        evaluated: jsonLdPages.length > 0,
        score: invalidJsonLdPages.length ? 3 : 8,
        title: jsonLdPages.length
          ? 'Observed JSON-LD parses cleanly'
          : 'JSON-LD syntax was not evaluated',
        plainEnglish: jsonLdPages.length
          ? invalidJsonLdPages.length
            ? `${invalidJsonLdPages.length} evaluated page contains invalid JSON-LD.`
            : 'The JSON-LD observed on evaluated pages parsed cleanly.'
          : 'No JSON-LD was observed, so this report cannot make a syntax claim.',
        action: invalidJsonLdPages.length
          ? 'Fix invalid JSON-LD before relying on its structured-data claims.'
          : 'Use structured data only where it accurately represents the visible page and a supported use case.',
        urls: invalidJsonLdPages.slice(0, 10).map((page) => page.finalUrl),
      }),
    ]),
    section('content-clarity', 'Content clarity', [
      check({
        id: 'answerable-content',
        section: 'content-clarity',
        maxScore: 16,
        score: scoreFromPercent(pct(answerablePages.length, pageCount), 16),
        title: 'Pages answer questions directly',
        plainEnglish: `${pct(answerablePages.length, pageCount)}% of indexable pages look answer-ready.`,
        action:
          'Put short, direct answers near the top of informational pages, then support them with examples, steps, data, or citations.',
        urls: sampleUrls(pages, (page) => !page.geo?.answerable),
      }),
      check({
        id: 'semantic-html',
        section: 'content-clarity',
        maxScore: 8,
        score: scoreFromPercent(pct(semanticPages.length, pageCount), 8),
        title: 'Pages use semantic HTML',
        plainEnglish: `${pct(semanticPages.length, pageCount)}% of indexable pages use semantic structure.`,
        action:
          'Use real headings, lists, tables, nav, main, article, and section elements instead of layout-only divs.',
      }),
      check({
        id: 'titles-headings-meta',
        section: 'content-clarity',
        maxScore: 10,
        score: scoreFromPercent(
          Math.round(
            (pct(titlePages.length, pageCount) +
              pct(metaPages.length, pageCount)) /
              2,
          ),
          10,
        ),
        title: 'Titles, H1s, and descriptions are clear',
        plainEnglish: `${pct(titlePages.length, pageCount)}% of indexable pages have title/H1 coverage and ${pct(metaPages.length, pageCount)}% have meta descriptions.`,
        action:
          'Write a unique title, one clear H1, and a useful description for every indexable page.',
      }),
      check({
        id: 'language',
        section: 'content-clarity',
        maxScore: 4,
        score: scoreFromPercent(pct(langPages.length, pageCount), 4),
        title: 'HTML language is declared',
        plainEnglish: `${pct(langPages.length, pageCount)}% of indexable pages declare a language.`,
        action:
          'Set the html lang attribute so crawlers and assistive tech understand the page language.',
      }),
    ]),
    section('entity-signals', 'Entity signals', [
      check({
        id: 'entity-schema',
        section: 'entity-signals',
        maxScore: 14,
        score: scoreFromPercent(pct(entityPages.length, pageCount), 14),
        title: 'The site states who or what it represents',
        plainEnglish: `${pct(entityPages.length, pageCount)}% of indexable pages include entity signals such as Organization, Person, Product, sameAs, or social profile links.`,
        action:
          'Make the homepage and key pages explicit about the brand, product, people, and official profiles using accurate schema and links.',
        urls: sampleUrls(pages, (page) => !entityPages.includes(page)),
      }),
      check({
        id: 'authors-dates',
        section: 'entity-signals',
        maxScore: 8,
        score: scoreFromPercent(
          Math.round(
            (pct(
              pages.filter((page) => page.geo?.hasAuthor).length,
              pageCount,
            ) +
              pct(
                pages.filter((page) => page.geo?.hasDate).length,
                pageCount,
              )) /
              2,
          ),
          8,
        ),
        title: 'People and dates are visible where they matter',
        plainEnglish:
          'Author and date signals help agents judge freshness and accountability.',
        action:
          'Add visible authors, reviewed dates, and updated dates to content where trust and freshness matter.',
      }),
    ]),
    section('technical-ux', 'Technical UX', [
      check({
        id: 'https-viewport-readable',
        section: 'technical-ux',
        maxScore: 12,
        score: scoreFromPercent(
          Math.round(
            (pct(httpsPages.length, pageCount) +
              pct(viewportPages.length, pageCount) +
              pct(readablePages.length, pageCount)) /
              3,
          ),
          12,
        ),
        title: 'Pages are secure, mobile-ready, and readable from HTML',
        plainEnglish:
          'Agents need stable HTML content, not just a visual page that works in one browser session.',
        action:
          'Serve HTTPS, include viewport metadata, and make important copy available in the initial HTML or rendered output.',
      }),
      check({
        id: 'status-indexability',
        section: 'technical-ux',
        maxScore: 12,
        score: scoreFromPercent(
          pct(pages.length, report.pages.length || 1),
          12,
        ),
        title: 'Crawled pages are indexable and error-free',
        plainEnglish: `${pct(pages.length, report.pages.length || 1)}% of crawled pages are indexable 2xx pages.`,
        action:
          'Fix 4xx/5xx pages, accidental noindex, and blocked internal URLs before expanding AI discovery work.',
      }),
    ]),
    section('crawl-completeness', 'Crawl completeness', [
      check({
        id: 'crawl-depth',
        section: 'crawl-completeness',
        maxScore: 8,
        score: report.summary.totalPages >= report.config.maxPages ? 3 : 8,
        title:
          report.summary.totalPages >= report.config.maxPages
            ? 'The crawl hit the page cap'
            : 'The crawl finished without hitting the page cap',
        plainEnglish:
          report.summary.totalPages >= report.config.maxPages
            ? `The crawl stopped at maxPages (${report.config.maxPages}), so the readiness score may under-sample the site.`
            : 'The crawl did not hit the configured page cap.',
        action:
          'Raise --max-pages or crawl from sitemap mode when you need a complete site inventory.',
      }),
      check({
        id: 'internal-link-discovery',
        section: 'crawl-completeness',
        maxScore: 8,
        score:
          report.summary.discoveredUrls > report.summary.totalPages ? 8 : 4,
        title: 'Internal links expose more of the site',
        plainEnglish:
          'A healthy crawl should discover important pages through internal links, not only through a seed URL.',
        action:
          'Link important pages from navigational, hub, or contextual links so crawlers can find them naturally.',
      }),
    ]),
  ]

  const checks = sections.flatMap((item) => item.checks)
  const maxScore = sections.reduce((sum, item) => sum + item.maxScore, 0)
  const rawScore = sections.reduce((sum, item) => sum + item.score, 0)
  const score = scoreFromPercent(pct(rawScore, maxScore), 100)
  const dataStatus =
    report.status === 'completed' && !robotsUnavailable
      ? ('complete' as const)
      : ('partial' as const)
  const topActions = checks
    .filter((item) => item.status !== 'pass')
    .sort((a, b) => b.maxScore - b.score - (a.maxScore - a.score))
    .slice(0, 8)

  return {
    reportId: report.id,
    url: report.config.url,
    generatedAt: report.generatedAt,
    dataStatus,
    score,
    grade: grade(score),
    headline:
      dataStatus === 'partial'
        ? 'Readiness evidence is incomplete; rerun after fixing the collection gaps before treating this as a site-wide verdict.'
        : score >= 75
          ? 'The site has a solid foundation for AI discovery.'
          : 'The site needs readiness fixes before AI discovery work will compound.',
    sections,
    checks,
    topActions,
    botAccess,
    agentResources: report.ai?.agentResources ?? [],
    caveats: [
      ...report.caveats,
      ...(report.ai?.robotsTxt
        ? robotsUnavailable
          ? [
              'robots.txt was unavailable, so crawler access and sitemap declaration checks are inconclusive.',
            ]
          : []
        : [
            'This crawl report does not include top-level robots.txt AI bot data.',
          ]),
    ],
  }
}
