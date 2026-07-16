import { effectiveSnippetControl } from '../../robots-directives.js'
import type { CrawlPageSnapshot } from '../monitoring/types.js'
import type { CrawlAgentDiscovery } from './agent-discovery.js'
import { isEntityEvidenceSchemaType } from './entity-readiness.js'
import type {
  CrawlAiBotAccess,
  CrawlAiResourceSignal,
  CrawlReport,
} from './report.js'

export type ReadinessStatus = 'pass' | 'warning' | 'fail' | 'unknown' | 'info'

export type ReadinessCheck = {
  id: string
  section: string
  status: ReadinessStatus
  evaluated: boolean
  title: string
  plainEnglish: string
  action: string
  evidence?: Record<string, unknown>
  urls?: string[]
}

export type ReadinessSection = {
  id: string
  title: string
  checks: ReadinessCheck[]
}

export type AiReadinessReport = {
  reportId: string
  url: string
  generatedAt: string
  dataStatus: 'complete' | 'partial'
  assessment: 'evidence-only'
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
  if (maxScore === 0) return 'info'
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
  return { id, title, checks }
}

function check(
  input: Omit<ReadinessCheck, 'status' | 'evaluated'> & {
    evaluated?: boolean
    score: number
    maxScore: number
  },
): ReadinessCheck {
  const { score, maxScore, ...output } = input
  const evaluated = input.evaluated ?? true
  return {
    ...output,
    evaluated,
    status: evaluated ? status(score, maxScore) : 'unknown',
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

export function aiReadiness(report: CrawlReport): AiReadinessReport {
  const agentDiscovery = (
    report as CrawlReport & { agentDiscovery?: CrawlAgentDiscovery }
  ).agentDiscovery
  const pages = indexablePages(report)
  const pageCount = pages.length
  const hasIndexablePages = pageCount > 0
  const pageLimitReached = report.summary.pageLimitReached
  const robotsTxt = report.ai?.robotsTxt
  const botAccess = robotsTxt?.botAccess ?? []
  const blockedBots = botAccess.filter((bot) => bot.allowed === false)
  const unknownBots = botAccess.filter((bot) => bot.allowed === null)
  const robotsUnavailable =
    robotsTxt?.availability === 'rate-limited' ||
    robotsTxt?.availability === 'unreachable'
  const hasRobotsEvidence = robotsTxt !== undefined
  const hasBotAccessEvidence = hasRobotsEvidence && botAccess.length > 0
  const botAccessEvaluated = hasBotAccessEvidence && !robotsUnavailable
  const sitemapEvaluated = hasRobotsEvidence && !robotsUnavailable
  const robotsEvidenceIncomplete =
    robotsUnavailable || !hasRobotsEvidence || !hasBotAccessEvidence
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
      page.schemaTypes?.some(isEntityEvidenceSchemaType) ||
      (page.schemaSameAs?.length ?? 0) > 0 ||
      (page.socialProfileLinks?.length ?? 0) > 0,
  )
  const snippetControls = pages.map((page) => ({
    url: page.finalUrl,
    control: effectiveSnippetControl({
      metaRobots: page.metaRobots,
      xRobotsTag: page.xRobotsTag,
    }),
  }))
  const restrictedSnippets = snippetControls.filter(
    ({ control }) => control.status !== 'not-restricted',
  )
  const blockedSnippets = restrictedSnippets.filter(
    ({ control }) => control.status === 'blocked',
  )
  const limitedSnippets = restrictedSnippets.filter(
    ({ control }) => control.status === 'limited',
  )
  const sections = [
    section('agent-access', 'Agent access', [
      check({
        id: 'robots-ai-bots',
        section: 'agent-access',
        maxScore: 20,
        evaluated: botAccessEvaluated,
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
          ? 'robots.txt crawler-policy evidence is unavailable'
          : !hasBotAccessEvidence
            ? 'robots.txt crawler-policy evidence was not collected'
            : blockedBots.length
              ? 'robots.txt blocks selected crawler tokens at the start URL'
              : 'robots.txt allows selected crawler tokens at the start URL',
        plainEnglish: robotsUnavailable
          ? 'The robots.txt request failed, so this report cannot say whether selected crawler tokens are allowed at the start URL.'
          : !hasBotAccessEvidence
            ? 'This crawl does not include per-bot robots.txt policy data for the start URL.'
            : blockedBots.length
              ? `robots.txt policy blocks ${blockedBots.length} selected crawler ${blockedBots.length === 1 ? 'token' : 'tokens'} at the start URL.`
              : 'robots.txt policy does not block the selected crawler tokens at the start URL. This does not verify actual or site-wide fetchability.',
        action: robotsUnavailable
          ? 'Restore a stable robots.txt response, then rerun this report before making crawler-policy claims.'
          : !hasBotAccessEvidence
            ? 'Rerun the crawl with top-level per-bot robots.txt evidence before making crawler-policy claims.'
            : blockedBots.length
              ? 'Only block AI crawlers intentionally. If discovery matters, remove accidental Disallow rules for the blocked user agents.'
              : 'Keep robots.txt explicit and intentional so humans and agents can see what is allowed.',
        evidence: {
          blockedBots,
          unknownBots,
          declaredBots: declaredBots.length,
          availability: robotsTxt?.availability,
          status: robotsTxt?.status,
          error: robotsTxt?.error,
          scope: 'start-url-robots-policy',
          startUrl: report.config.url,
        },
      }),
      check({
        id: 'robots-sitemap',
        section: 'agent-access',
        maxScore: 0,
        evaluated: sitemapEvaluated,
        score: 0,
        title: sitemapEvaluated
          ? 'robots.txt sitemap declarations were checked'
          : 'robots.txt sitemap declarations were not evaluated',
        plainEnglish: robotsUnavailable
          ? 'The robots.txt response was unavailable, so sitemap declarations could not be checked.'
          : !hasRobotsEvidence
            ? 'This crawl does not include top-level robots.txt evidence, so sitemap declarations could not be checked.'
            : robotsTxt.sitemapUrls.length
              ? 'robots.txt declares at least one sitemap URL.'
              : 'robots.txt does not declare a sitemap URL.',
        action: robotsUnavailable
          ? 'Restore robots.txt availability and rerun before evaluating sitemap declarations.'
          : !hasRobotsEvidence
            ? 'Rerun the crawl with top-level robots.txt evidence before evaluating sitemap declarations.'
            : 'Add a Sitemap line to robots.txt so crawlers can discover the full index quickly.',
        evidence: { sitemapUrls: robotsTxt?.sitemapUrls ?? [] },
      }),
      check({
        id: 'agent-resources',
        section: 'agent-access',
        maxScore: 0,
        score: 0,
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
        maxScore: 0,
        score: 0,
        title: 'llms.txt is optional',
        plainEnglish: report.ai?.llmsTxt?.exists
          ? agentDiscovery?.llmsTxt
            ? `An optional llms.txt file was found and its body was checked. It declared ${agentDiscovery.llmsTxt.links.length} links, ${agentDiscovery.llmsTxt.duplicateLinks.length} duplicates, and ${agentDiscovery.llmsTxt.missingCrawlRoutes.length} links outside the crawled route inventory. Google says llms.txt has no positive or negative Search impact.`
            : 'An optional llms.txt file was found. Its body was not validated in this crawl. Google says it has no positive or negative Search impact.'
          : 'No llms.txt file was found. Google says the file is not needed for Search and does not affect visibility.',
        action:
          'No SEO action is required. Generate one only for a specific agent or service that consumes it.',
        evidence: {
          llmsTxt: report.ai?.llmsTxt,
          validation: agentDiscovery?.llmsTxt,
          googleSearchImpact: 'none',
          guidanceUrl:
            'https://developers.google.com/search/updates#clarifying-guidance-on-llms-txt-files',
        },
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
        maxScore: 0,
        evaluated: hasIndexablePages,
        score: 0,
        title: 'Short opening paragraphs are an unscored observation',
        plainEnglish: hasIndexablePages
          ? `${pct(answerablePages.length, pageCount)}% of indexable pages have at least one 25-word paragraph near the start. This does not establish content quality, citation likelihood, or Google AI eligibility.`
          : 'No indexable 2xx pages were available, so opening-paragraph coverage was not evaluated.',
        action:
          'Write for the reader and the page intent. Do not create artificial answer blocks or chunk content solely for AI Search.',
        urls: sampleUrls(pages, (page) => !page.geo?.answerable),
        evidence: {
          observedPages: answerablePages.length,
          evaluatedPages: pageCount,
          heuristic: 'one-of-first-three-paragraphs-has-at-least-25-words',
          googleSearchImpact: 'not-established',
          guidanceUrl:
            'https://developers.google.com/search/docs/fundamentals/ai-optimization-guide',
        },
      }),
      check({
        id: 'semantic-html',
        section: 'content-clarity',
        maxScore: 0,
        evaluated: hasIndexablePages,
        score: 0,
        title: 'Semantic HTML coverage observed',
        plainEnglish: hasIndexablePages
          ? `${pct(semanticPages.length, pageCount)}% of indexable pages use semantic structure.`
          : 'No indexable 2xx pages were available, so semantic HTML coverage was not evaluated.',
        action:
          'Use real headings, lists, tables, nav, main, article, and section elements instead of layout-only divs.',
      }),
      check({
        id: 'titles-headings-meta',
        section: 'content-clarity',
        maxScore: 0,
        evaluated: hasIndexablePages,
        score: 0,
        title: 'Title, H1, and description coverage observed',
        plainEnglish: hasIndexablePages
          ? `${pct(titlePages.length, pageCount)}% of indexable pages have title/H1 coverage and ${pct(metaPages.length, pageCount)}% have meta descriptions.`
          : 'No indexable 2xx pages were available, so title, H1, and description coverage was not evaluated.',
        action:
          'Write a unique title and descriptive H1. Add a useful meta description when a summary would help searchers understand the page.',
      }),
      check({
        id: 'language',
        section: 'content-clarity',
        maxScore: 0,
        evaluated: hasIndexablePages,
        score: 0,
        title: 'HTML language declaration coverage observed',
        plainEnglish: hasIndexablePages
          ? `${pct(langPages.length, pageCount)}% of indexable pages declare a language.`
          : 'No indexable 2xx pages were available, so language declaration coverage was not evaluated.',
        action:
          'Set the html lang attribute so crawlers and assistive tech understand the page language.',
      }),
    ]),
    section('entity-signals', 'Entity signals', [
      check({
        id: 'entity-schema',
        section: 'entity-signals',
        maxScore: 0,
        evaluated: hasIndexablePages,
        score: 0,
        title: 'Entity-signal coverage observed',
        plainEnglish: hasIndexablePages
          ? `${pct(entityPages.length, pageCount)}% of indexable pages include entity signals such as Organization, Person, Product, sameAs, or social profile links.`
          : 'No indexable 2xx pages were available, so entity-signal coverage was not evaluated.',
        action:
          'Make the homepage and key pages explicit about the brand, product, people, and official profiles using accurate schema and links.',
        urls: sampleUrls(pages, (page) => !entityPages.includes(page)),
      }),
      check({
        id: 'authors-dates',
        section: 'entity-signals',
        maxScore: 0,
        score: 0,
        title: 'People and dates are visible where they matter',
        plainEnglish:
          'Author and date signals help agents judge freshness and accountability.',
        action:
          'Add visible authors, reviewed dates, and updated dates to content where trust and freshness matter.',
      }),
    ]),
    section('technical-ux', 'Technical UX', [
      check({
        id: 'snippet-controls',
        section: 'technical-ux',
        maxScore: 0,
        evaluated: hasIndexablePages,
        score: 0,
        title: !hasIndexablePages
          ? 'Snippet controls were not evaluated'
          : restrictedSnippets.length
            ? 'Page-level snippet restrictions observed'
            : 'No page-level snippet restriction detected',
        plainEnglish: !hasIndexablePages
          ? 'No indexable 2xx pages were available, so snippet controls were not evaluated.'
          : restrictedSnippets.length
            ? `${blockedSnippets.length} indexable ${blockedSnippets.length === 1 ? 'page has' : 'pages have'} snippets blocked and ${limitedSnippets.length} ${limitedSnippets.length === 1 ? 'has' : 'have'} a positive max-snippet limit.`
            : 'No nosnippet or restrictive max-snippet directive was detected on the evaluated indexable pages.',
        action: restrictedSnippets.length
          ? 'Confirm each restriction is intentional. Do not remove publisher controls solely to satisfy this report.'
          : 'No action is required. This observation does not guarantee that Google will select or show a snippet.',
        urls: restrictedSnippets.slice(0, 10).map(({ url }) => url),
        evidence: {
          evaluatedPages: pages.length,
          blockedPages: blockedSnippets.length,
          limitedPages: limitedSnippets.length,
          restrictions: restrictedSnippets.slice(0, 10),
        },
      }),
      check({
        id: 'https-viewport-readable',
        section: 'technical-ux',
        maxScore: 0,
        score: 0,
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
        evaluated: report.pages.length > 0,
        score: scoreFromPercent(
          pct(pages.length, report.pages.length || 1),
          12,
        ),
        title: report.pages.length
          ? 'Crawled-page indexability observed'
          : 'Crawled-page indexability was not evaluated',
        plainEnglish: report.pages.length
          ? `${pct(pages.length, report.pages.length)}% of crawled pages are indexable 2xx pages.`
          : 'No crawled pages were available, so status and indexability were not evaluated.',
        action:
          'Fix 4xx/5xx pages, accidental noindex, and blocked internal URLs before expanding AI discovery work.',
      }),
    ]),
    section('agent-content', 'Agent content observations', [
      check({
        id: 'markdown-alternates',
        section: 'agent-content',
        maxScore: 0,
        score: 0,
        evaluated: Boolean(agentDiscovery),
        title: agentDiscovery
          ? 'Markdown alternatives were checked'
          : 'Markdown alternatives were not evaluated',
        plainEnglish: agentDiscovery
          ? `${agentDiscovery.markdownAlternates.evaluatedPages} of ${agentDiscovery.markdownAlternates.eligibleHtmlPages} successful HTML pages returned Markdown through an explicit alternative or content negotiation. ${agentDiscovery.markdownAlternates.exactByteMatches} paired explicit responses matched content negotiation byte for byte.`
          : 'This crawl does not include the focused representation checks, so it cannot say whether HTML pages publish stable Markdown alternatives.',
        action:
          'Use the focused agent-readiness report when you need route coverage, content negotiation, byte stability, or extraction-quality evidence.',
        evidence: agentDiscovery
          ? {
              eligibleHtmlPages:
                agentDiscovery.markdownAlternates.eligibleHtmlPages,
              advertisedPages:
                agentDiscovery.markdownAlternates.advertisedPages,
              exactByteMatches:
                agentDiscovery.markdownAlternates.exactByteMatches,
              stableResponses:
                agentDiscovery.markdownAlternates.stableResponses,
            }
          : undefined,
      }),
      check({
        id: 'agent-skills-discovery',
        section: 'agent-content',
        maxScore: 0,
        score: 0,
        evaluated: Boolean(agentDiscovery),
        title: agentDiscovery
          ? 'Agent Skills discovery was checked'
          : 'Agent Skills discovery was not evaluated',
        plainEnglish: agentDiscovery
          ? `${agentDiscovery.agentSkills.skills.length} published skill${agentDiscovery.agentSkills.skills.length === 1 ? '' : 's'} were found. ${agentDiscovery.agentSkills.skills.filter((skill) => skill.digestMatches).length} matched their declared SHA-256 digest.`
          : 'This crawl checked common legacy descriptor paths but did not validate the Agent Skills discovery index or its file digests.',
        action:
          'Publish Agent Skills only for real reusable capabilities. Generate the index digest from the exact deployed SKILL.md bytes.',
        evidence: agentDiscovery?.agentSkills as
          | Record<string, unknown>
          | undefined,
      }),
      check({
        id: 'agent-content-profile',
        section: 'agent-content',
        maxScore: 0,
        score: 0,
        evaluated: Boolean(agentDiscovery),
        title: agentDiscovery
          ? 'The content profile was selected explicitly'
          : 'No focused agent-readiness profile was selected',
        plainEnglish: agentDiscovery
          ? 'Document access, representations, discovery, identity, and extraction quality were evaluated. API, application, and commerce checks were marked not applicable rather than failed.'
          : 'A normal crawl does not assume that a content site also exposes a public API, remote agent endpoint, or checkout.',
        action:
          'Run a different profile only when that public capability really exists.',
        evidence: agentDiscovery?.profileApplicability,
      }),
    ]),
    section('crawl-completeness', 'Crawl completeness', [
      check({
        id: 'crawl-depth',
        section: 'crawl-completeness',
        maxScore: 8,
        score: pageLimitReached ? 3 : 8,
        title: pageLimitReached
          ? 'The crawl hit the page cap'
          : 'The crawl finished without hitting the page cap',
        plainEnglish: pageLimitReached
          ? `The crawl stopped at maxPages (${report.config.maxPages}), so the report may under-sample the site.`
          : 'The crawl did not hit the configured page cap.',
        action:
          'Raise --max-pages or crawl from sitemap mode when you need a complete site inventory.',
      }),
      check({
        id: 'internal-link-discovery',
        section: 'crawl-completeness',
        maxScore: 0,
        score: 0,
        title: 'Internal links expose more of the site',
        plainEnglish:
          'A healthy crawl should discover important pages through internal links, not only through a seed URL.',
        action:
          'Link important pages from navigational, hub, or contextual links so crawlers can find them naturally.',
      }),
    ]),
  ]

  const checks = sections.flatMap((item) => item.checks)
  const dataStatus =
    report.status === 'completed' && !robotsEvidenceIncomplete
      ? ('complete' as const)
      : ('partial' as const)
  const topActions = checks
    .filter(
      (item) =>
        item.evaluated &&
        (item.status === 'warning' || item.status === 'fail') &&
        [
          'robots-ai-bots',
          'valid-json-ld',
          'status-indexability',
          'crawl-depth',
        ].includes(item.id),
    )
    .sort(
      (a, b) =>
        Number(b.status === 'fail') - Number(a.status === 'fail') ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 8)

  return {
    reportId: report.id,
    url: report.config.url,
    generatedAt: report.generatedAt,
    dataStatus,
    assessment: 'evidence-only',
    headline:
      dataStatus === 'partial'
        ? 'AI-search evidence is incomplete. Fix the collection gaps before drawing site-wide conclusions.'
        : topActions.length
          ? `${topActions.length} evidence-backed technical ${topActions.length === 1 ? 'action remains' : 'actions remain'}. Optional observations are not treated as ranking or citation factors.`
          : 'No evidence-backed technical action was found in this crawl. This is not a visibility or citation verdict.',
    sections,
    checks,
    topActions,
    botAccess,
    agentResources: report.ai?.agentResources ?? [],
    caveats: [
      ...report.caveats,
      'This report deliberately has no aggregate readiness score. Google documents no separate technical requirements for its generative AI Search features.',
      'llms.txt is treated as optional agent-discovery metadata, not a Google Search ranking or visibility factor.',
      'Paragraph length and placement are observations only. Google does not require content chunking or special answer blocks for generative AI features.',
      'Snippet controls reflect page-level publisher directives only. No detected restriction does not guarantee selection, visibility, or a displayed snippet.',
      ...(robotsTxt
        ? robotsUnavailable
          ? [
              'robots.txt was unavailable, so crawler access and sitemap declaration checks are inconclusive.',
            ]
          : !hasBotAccessEvidence
            ? [
                'robots.txt was collected without per-bot policy evidence, so the crawler-policy check is inconclusive.',
              ]
            : []
        : [
            'This crawl report does not include top-level robots.txt AI bot data.',
          ]),
      'robots.txt checks describe policy for the configured start URL only. They do not verify actual crawler requests or site-wide access.',
    ],
  }
}
