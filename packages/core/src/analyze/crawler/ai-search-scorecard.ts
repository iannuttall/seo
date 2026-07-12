import { effectiveSnippetControl } from '../../robots-directives.js'
import type { CrawlPageSnapshot } from '../monitoring/types.js'
import { entityReadiness } from './entity-readiness.js'
import { type GeoGapResult, geoGapsReport } from './geo-gaps.js'
import { auditLlmsTxt } from './llms.js'
import type { CrawlAiBotAccess, CrawlReport } from './report.js'

export const AI_SEARCH_SCORECARD_METHODOLOGY_ID = 'seo-ai-search-scorecard'
export const AI_SEARCH_SCORECARD_METHODOLOGY_VERSION = 1

export type ScorecardStatus = 'pass' | 'warn' | 'fail' | 'unknown'

/**
 * Status credit is this tool's own heuristic weighting. It is not a Google or
 * AI-engine requirement. A `warn` earns half credit because the observed
 * evidence is mixed, not because a partial state maps to a documented rule.
 */
export const SCORECARD_STATUS_CREDIT: Record<
  Exclude<ScorecardStatus, 'unknown'>,
  number
> = {
  pass: 1,
  warn: 0.5,
  fail: 0,
}

/**
 * Fixed check order and per-check weights. Ordering is stable so the same crawl
 * always serializes to the same bytes. Weights sum to 100 for readability; the
 * score itself is normalized against the weight of the checks that had known
 * evidence, so unknown checks never change the denominator silently.
 */
export const SCORECARD_CHECK_WEIGHTS = {
  'ai-bot-access': 20,
  https: 10,
  'indexable-pages': 15,
  'structured-data': 15,
  'valid-json-ld': 10,
  'entity-identity': 20,
  'answerable-content': 10,
} as const satisfies Record<string, number>

export type ScorecardCheckId = keyof typeof SCORECARD_CHECK_WEIGHTS

const SCORECARD_CHECK_ORDER: readonly ScorecardCheckId[] = [
  'ai-bot-access',
  'https',
  'indexable-pages',
  'structured-data',
  'valid-json-ld',
  'entity-identity',
  'answerable-content',
]

export type ScorecardCheck = {
  id: ScorecardCheckId
  label: string
  weight: number
  status: ScorecardStatus
  observed: Record<string, unknown>
  finding: string
  verification: string
  reason?: string
}

export type ScorecardObservation = {
  id: string
  label: string
  observed: Record<string, unknown>
  note: string
}

export type ScorecardBand = 'strong' | 'moderate' | 'weak' | 'unscored'

export type AiSearchScorecard = {
  reportId: string
  url: string
  generatedAt: string
  methodology: {
    id: string
    version: number
    summary: string
    statusCredit: Record<Exclude<ScorecardStatus, 'unknown'>, number>
    weights: Record<ScorecardCheckId, number>
    formula: string
  }
  score: number | null
  scoreLabel: 'heuristic-check-summary'
  maxScore: 100
  band: ScorecardBand
  partial: boolean
  crawlComplete: boolean
  counts: {
    pass: number
    warn: number
    fail: number
    unknown: number
    scored: number
  }
  weightScored: number
  weightTotal: number
  excluded: Array<{ id: string; reason: string }>
  checks: ScorecardCheck[]
  observations: ScorecardObservation[]
  headline: string
  caveats: string[]
  source: {
    provider: 'seo-crawl'
    crawlStatus: CrawlReport['status']
    requestEvidenceStatus: CrawlReport['requestEvidenceStatus']
    startUrl: string
    configuredMaxPages: number
    pageLimitReached: boolean
    evaluatedPages: number
    crawledPages: number
    partialReasons: GeoGapResult['source']['partialReasons']
  }
}

const ENTITY_SCHEMA_PATTERN =
  /^(Organization|LocalBusiness|Person|Product|WebSite)$/i
const SITE_ENTITY_TYPE_PATTERN = /^(Organization|LocalBusiness)$/i

function indexablePages(report: CrawlReport): CrawlPageSnapshot[] {
  return report.pages.filter((page) => page.indexable && page.status < 400)
}

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

function sampleUrls(pages: CrawlPageSnapshot[]): string[] {
  return pages.slice(0, 10).map((page) => page.finalUrl)
}

function coverageStatus(
  covered: number,
  total: number,
  passRatio: number,
): ScorecardStatus {
  if (total === 0) return 'unknown'
  const ratio = covered / total
  if (ratio >= passRatio) return 'pass'
  if (covered > 0) return 'warn'
  return 'fail'
}

function botAccessCheck(report: CrawlReport): ScorecardCheck {
  const base = {
    id: 'ai-bot-access' as const,
    label: 'AI crawler access in the start-URL robots policy',
    weight: SCORECARD_CHECK_WEIGHTS['ai-bot-access'],
  }
  const robotsTxt = report.ai?.robotsTxt
  const startUrl = report.config.url
  const verification = `Fetch ${robotsTxt?.url ?? `${new URL(startUrl).origin}/robots.txt`} and confirm every Disallow rule for the listed AI crawler tokens is intentional.`

  if (!robotsTxt) {
    return {
      ...base,
      status: 'unknown',
      reason:
        'This crawl did not collect top-level robots.txt policy evidence for AI crawler tokens.',
      observed: { robotsEvidence: 'not-collected', startUrl },
      finding:
        'AI crawler access could not be evaluated because per-bot robots.txt evidence was not collected.',
      verification,
    }
  }

  const unavailable =
    robotsTxt.availability === 'rate-limited' ||
    robotsTxt.availability === 'unreachable' ||
    robotsTxt.availability === 'access-blocked'
  const botAccess = robotsTxt.botAccess ?? []
  if (unavailable || botAccess.length === 0) {
    return {
      ...base,
      status: 'unknown',
      reason: unavailable
        ? `robots.txt was ${robotsTxt.availability}, so the AI crawler policy could not be read.`
        : 'No AI crawler tokens were evaluated against the start-URL robots policy.',
      observed: {
        availability: robotsTxt.availability,
        status: robotsTxt.status,
        error: robotsTxt.error,
        botAccess,
        startUrl,
      },
      finding:
        'AI crawler access is inconclusive from this crawl. Restore a readable robots.txt response and rerun before drawing a conclusion.',
      verification,
    }
  }

  const blocked = botAccess.filter((bot) => bot.allowed === false)
  const blockedUserAgents = blocked.map(
    (bot: CrawlAiBotAccess) => bot.userAgent,
  )
  const status: ScorecardStatus =
    blocked.length === 0
      ? 'pass'
      : blocked.length === botAccess.length
        ? 'fail'
        : 'warn'
  const finding =
    status === 'pass'
      ? 'The start-URL robots policy does not block any evaluated AI crawler token. This describes policy at the entry point, not proven fetchability of every URL.'
      : status === 'fail'
        ? `The start-URL robots policy blocks all ${botAccess.length} evaluated AI crawler tokens. This may be intentional; confirm before treating it as a defect.`
        : `The start-URL robots policy blocks ${blocked.length} of ${botAccess.length} evaluated AI crawler tokens (${blockedUserAgents.join(', ')}). This may be intentional; confirm before treating it as a defect.`

  return {
    ...base,
    status,
    observed: {
      availability: robotsTxt.availability,
      status: robotsTxt.status,
      evaluatedTokens: botAccess.length,
      blockedTokens: blocked.length,
      blockedUserAgents,
      botAccess,
      startUrl,
    },
    finding,
    verification,
  }
}

function httpsCheck(pages: CrawlPageSnapshot[]): ScorecardCheck {
  const base = {
    id: 'https' as const,
    label: 'Secure transport on evaluated pages',
    weight: SCORECARD_CHECK_WEIGHTS.https,
  }
  const verification =
    'Load a sample of the returned pages and confirm each is served over HTTPS with no mixed-content downgrade.'
  if (pages.length === 0) {
    return {
      ...base,
      status: 'unknown',
      reason: 'No indexable 2xx pages were evaluated in this crawl.',
      observed: { evaluatedPages: 0 },
      finding:
        'HTTPS coverage could not be evaluated because no indexable 2xx pages were available.',
      verification,
    }
  }
  const httpsPages = pages.filter((page) => page.isHttps === true)
  const status = coverageStatus(httpsPages.length, pages.length, 1)
  return {
    ...base,
    status,
    observed: {
      evaluatedPages: pages.length,
      httpsPages: httpsPages.length,
      coveragePercent: pct(httpsPages.length, pages.length),
      insecureSample: sampleUrls(pages.filter((page) => page.isHttps !== true)),
    },
    finding:
      status === 'pass'
        ? 'Every evaluated indexable page was served over HTTPS.'
        : `${pct(httpsPages.length, pages.length)}% of evaluated indexable pages were served over HTTPS.`,
    verification,
  }
}

function indexablePagesCheck(report: CrawlReport): ScorecardCheck {
  const base = {
    id: 'indexable-pages' as const,
    label: 'Indexable 2xx share of crawled pages',
    weight: SCORECARD_CHECK_WEIGHTS['indexable-pages'],
  }
  const verification =
    'Review the non-indexable crawled URLs and confirm each noindex, redirect, canonical, or error state is intended.'
  const crawled = report.pages.length
  if (crawled === 0) {
    return {
      ...base,
      status: 'unknown',
      reason: 'No pages were crawled, so indexability could not be evaluated.',
      observed: { crawledPages: 0 },
      finding:
        'Indexability could not be evaluated because no pages were crawled.',
      verification,
    }
  }
  const indexable = indexablePages(report).length
  const status = coverageStatus(indexable, crawled, 0.85)
  return {
    ...base,
    status,
    observed: {
      crawledPages: crawled,
      indexablePages: indexable,
      coveragePercent: pct(indexable, crawled),
    },
    finding: `${pct(indexable, crawled)}% of crawled pages are indexable 2xx pages. Non-indexable states can be intentional; this check flags share, not intent.`,
    verification,
  }
}

function structuredDataCheck(pages: CrawlPageSnapshot[]): ScorecardCheck {
  const base = {
    id: 'structured-data' as const,
    label: 'Structured-data coverage on evaluated pages',
    weight: SCORECARD_CHECK_WEIGHTS['structured-data'],
  }
  const verification =
    'Open a sample of the pages without structured data and confirm markup exists only where it accurately represents the visible page.'
  if (pages.length === 0) {
    return {
      ...base,
      status: 'unknown',
      reason: 'No indexable 2xx pages were evaluated in this crawl.',
      observed: { evaluatedPages: 0 },
      finding:
        'Structured-data coverage could not be evaluated because no indexable 2xx pages were available.',
      verification,
    }
  }
  const withStructuredData = pages.filter(
    (page) =>
      (page.structuredDataFormats?.length ?? 0) > 0 ||
      (page.schemaTypes?.length ?? 0) > 0,
  )
  const status = coverageStatus(withStructuredData.length, pages.length, 0.5)
  return {
    ...base,
    status,
    observed: {
      evaluatedPages: pages.length,
      pagesWithStructuredData: withStructuredData.length,
      coveragePercent: pct(withStructuredData.length, pages.length),
      missingSample: sampleUrls(
        pages.filter((page) => !withStructuredData.includes(page)),
      ),
    },
    finding: `${pct(withStructuredData.length, pages.length)}% of evaluated indexable pages expose structured data. Coverage is a convenience signal for agents, not a documented ranking or citation requirement.`,
    verification,
  }
}

function validJsonLdCheck(report: CrawlReport): ScorecardCheck {
  const base = {
    id: 'valid-json-ld' as const,
    label: 'JSON-LD parses cleanly where present',
    weight: SCORECARD_CHECK_WEIGHTS['valid-json-ld'],
  }
  const verification =
    'Validate the flagged pages with a JSON-LD or Rich Results parser and fix any syntax errors.'
  const jsonLdPages = report.pages.filter(
    (page) =>
      page.structuredDataFormats?.includes('json-ld') ||
      (page.invalidJsonLdCount ?? 0) > 0,
  )
  if (jsonLdPages.length === 0) {
    return {
      ...base,
      status: 'unknown',
      reason: 'No JSON-LD was observed, so its syntax could not be evaluated.',
      observed: { jsonLdPages: 0 },
      finding:
        'JSON-LD validity could not be evaluated because no JSON-LD was observed.',
      verification,
    }
  }
  const invalidPages = jsonLdPages.filter(
    (page) => (page.invalidJsonLdCount ?? 0) > 0,
  )
  const status: ScorecardStatus = invalidPages.length === 0 ? 'pass' : 'fail'
  return {
    ...base,
    status,
    observed: {
      jsonLdPages: jsonLdPages.length,
      invalidJsonLdPages: invalidPages.length,
      invalidSample: sampleUrls(invalidPages),
    },
    finding:
      status === 'pass'
        ? `JSON-LD on ${jsonLdPages.length} observed ${jsonLdPages.length === 1 ? 'page' : 'pages'} parsed cleanly. Clean syntax is not proof of entity recognition or rich-result eligibility.`
        : `${invalidPages.length} of ${jsonLdPages.length} pages with JSON-LD contain invalid JSON-LD.`,
    verification,
  }
}

function entityIdentityCheck(report: CrawlReport): ScorecardCheck {
  const base = {
    id: 'entity-identity' as const,
    label: 'Entity identity connected with sameAs',
    weight: SCORECARD_CHECK_WEIGHTS['entity-identity'],
  }
  const verification =
    'Confirm the homepage and key pages carry accurate Organization, Person, or LocalBusiness schema with sameAs links to profiles you control.'
  const entity = entityReadiness(report)
  if (entity.evaluatedPages === 0) {
    return {
      ...base,
      status: 'unknown',
      reason: 'No indexable 2xx pages were evaluated in this crawl.',
      observed: { evaluatedPages: 0 },
      finding:
        'Entity identity could not be evaluated because no indexable 2xx pages were available.',
      verification,
    }
  }
  const hasEntitySchema = Object.keys(entity.entities.schemaTypes).some(
    (type) => ENTITY_SCHEMA_PATTERN.test(type),
  )
  const siteSameAs = Object.entries(entity.entities.sameAsByType)
    .filter(([type]) => SITE_ENTITY_TYPE_PATTERN.test(type))
    .flatMap(([, urls]) => urls)
  const uniqueSiteSameAs = [...new Set(siteSameAs)].sort()
  const status: ScorecardStatus = uniqueSiteSameAs.length
    ? 'pass'
    : hasEntitySchema
      ? 'warn'
      : 'fail'
  return {
    ...base,
    status,
    observed: {
      evaluatedPages: entity.evaluatedPages,
      schemaTypes: entity.entities.schemaTypes,
      siteSameAs: uniqueSiteSameAs,
      sameAs: entity.entities.sameAs,
      socialProfiles: entity.entities.socialProfiles,
    },
    finding:
      status === 'pass'
        ? 'The crawl found sameAs links attached to Organization or LocalBusiness structured data for the site entity.'
        : status === 'warn'
          ? 'Entity schema is present, but no Organization or LocalBusiness sameAs evidence connects the site entity to official profiles.'
          : 'No Organization, LocalBusiness, Person, Product, or WebSite schema was found on the evaluated pages.',
    verification,
  }
}

function answerableContentCheck(pages: CrawlPageSnapshot[]): ScorecardCheck {
  const base = {
    id: 'answerable-content' as const,
    label: 'Substantive opening content (heuristic)',
    weight: SCORECARD_CHECK_WEIGHTS['answerable-content'],
  }
  const verification =
    'Read a sample of the flagged pages and confirm the opening content answers the page intent for a human reader.'
  if (pages.length === 0) {
    return {
      ...base,
      status: 'unknown',
      reason: 'No indexable 2xx pages were evaluated in this crawl.',
      observed: { evaluatedPages: 0 },
      finding:
        'Opening-content coverage could not be evaluated because no indexable 2xx pages were available.',
      verification,
    }
  }
  const answerable = pages.filter((page) => page.geo?.answerable)
  const status = coverageStatus(answerable.length, pages.length, 0.5)
  return {
    ...base,
    status,
    observed: {
      evaluatedPages: pages.length,
      answerablePages: answerable.length,
      coveragePercent: pct(answerable.length, pages.length),
      heuristic: 'one-of-first-three-paragraphs-has-at-least-25-words',
      missingSample: sampleUrls(pages.filter((page) => !page.geo?.answerable)),
    },
    finding: `${pct(answerable.length, pages.length)}% of evaluated indexable pages open with at least one substantive paragraph. This is a readability heuristic, not a content-quality or citation measure.`,
    verification,
  }
}

function buildObservations(report: CrawlReport): ScorecardObservation[] {
  const observations: ScorecardObservation[] = []

  const llms = auditLlmsTxt(report)
  observations.push({
    id: 'llms-txt',
    label: 'Optional llms.txt discovery file',
    observed: {
      exists: llms.exists,
      url: llms.llmsTxtUrl,
      status: llms.status,
      googleSearchImpact: llms.googleSearchImpact,
    },
    note: 'llms.txt is optional agent-discovery metadata. Google reports no positive or negative Search impact, so presence and absence are left out of the score.',
  })

  const agentResources = (report.ai?.agentResources ?? []).filter(
    (resource) => resource.exists,
  )
  observations.push({
    id: 'agent-descriptors',
    label: 'Machine-readable agent descriptors',
    observed: {
      detected: agentResources.length,
      resources: report.ai?.agentResources ?? [],
    },
    note: 'Descriptor files such as OpenAPI or agent metadata help machine discovery only when they are real. Their absence is not a search defect, so they are unscored.',
  })

  const restricted = indexablePages(report)
    .map((page) => ({
      url: page.finalUrl,
      control: effectiveSnippetControl({
        metaRobots: page.metaRobots,
        xRobotsTag: page.xRobotsTag,
      }),
    }))
    .filter(({ control }) => control.status !== 'not-restricted')
  observations.push({
    id: 'snippet-controls',
    label: 'Page-level snippet directives',
    observed: {
      restrictedPages: restricted.length,
      restrictions: restricted.slice(0, 10),
    },
    note: 'Snippet directives are intentional publisher controls. They are recorded as observations, not scored, because a restriction can be deliberate.',
  })

  return observations
}

function scorecardBand(score: number | null): ScorecardBand {
  if (score === null) return 'unscored'
  if (score >= 80) return 'strong'
  if (score >= 50) return 'moderate'
  return 'weak'
}

export function aiSearchScorecard(report: CrawlReport): AiSearchScorecard {
  const pages = indexablePages(report)
  const geo = geoGapsReport(report)
  const crawlComplete = geo.dataStatus === 'complete'

  const checksById: Record<ScorecardCheckId, ScorecardCheck> = {
    'ai-bot-access': botAccessCheck(report),
    https: httpsCheck(pages),
    'indexable-pages': indexablePagesCheck(report),
    'structured-data': structuredDataCheck(pages),
    'valid-json-ld': validJsonLdCheck(report),
    'entity-identity': entityIdentityCheck(report),
    'answerable-content': answerableContentCheck(pages),
  }
  const checks = SCORECARD_CHECK_ORDER.map((id) => checksById[id])

  const counts = {
    pass: checks.filter((check) => check.status === 'pass').length,
    warn: checks.filter((check) => check.status === 'warn').length,
    fail: checks.filter((check) => check.status === 'fail').length,
    unknown: checks.filter((check) => check.status === 'unknown').length,
    scored: 0,
  }
  const scoredChecks = checks.filter((check) => check.status !== 'unknown')
  counts.scored = scoredChecks.length
  const weightScored = scoredChecks.reduce(
    (total, check) => total + check.weight,
    0,
  )
  const weightTotal = checks.reduce((total, check) => total + check.weight, 0)
  const earned = scoredChecks.reduce(
    (total, check) =>
      total +
      check.weight *
        SCORECARD_STATUS_CREDIT[
          check.status as Exclude<ScorecardStatus, 'unknown'>
        ],
    0,
  )

  let score =
    weightScored > 0 ? Math.round((earned / weightScored) * 100) : null
  const partial = counts.unknown > 0 || !crawlComplete
  // A capped or partial crawl cannot support a clean, whole-site 100.
  if (score === 100 && partial) score = 99

  const excluded = checks
    .filter((check) => check.status === 'unknown')
    .map((check) => ({
      id: check.id,
      reason: check.reason ?? 'Evidence was unavailable for this check.',
    }))

  const observations = buildObservations(report)
  const band = scorecardBand(score)

  const headline =
    score === null
      ? 'AI search scorecard could not be scored because no check had known evidence in this crawl.'
      : `AI search scorecard: ${score}/100, a heuristic summary of ${counts.scored} of ${checks.length} of this tool's own checks with known evidence.${
          partial
            ? ` Score is partial: ${counts.unknown} ${counts.unknown === 1 ? 'check was' : 'checks were'} unknown${crawlComplete ? '' : ' and the crawl was incomplete'}, so a clean 100 is not possible.`
            : ''
        }`

  const caveats = [
    ...report.caveats,
    "This score is a heuristic summary of this tool's own checks. It is not a Google or AI-engine requirement, an eligibility verdict, a ranking factor, or a prediction of citations, indexing, visibility, or traffic.",
    'Only checks with known evidence are scored. Unknown checks are excluded and are never counted as failures.',
    ...(crawlComplete
      ? []
      : [
          `The crawl was incomplete (${geo.source.partialReasons.join(', ') || 'partial evidence'}), so this score is scoped to the evaluated pages and cannot be a clean 100.`,
        ]),
    ...(checksById['ai-bot-access'].status === 'warn' ||
    checksById['ai-bot-access'].status === 'fail'
      ? [
          'Blocking AI crawler tokens can be an intentional publisher choice. Confirm intent before treating the robots policy as a defect.',
        ]
      : []),
    'llms.txt, agent descriptors, and snippet directives are recorded as observations, not scored, because their absence or presence can be intentional.',
  ]

  return {
    reportId: report.id,
    url: report.config.url,
    generatedAt: report.generatedAt,
    methodology: {
      id: AI_SEARCH_SCORECARD_METHODOLOGY_ID,
      version: AI_SEARCH_SCORECARD_METHODOLOGY_VERSION,
      summary:
        "A deterministic 0-100 heuristic summary of this tool's own AI-search checks over one crawl. It is not a Google or AI-engine requirement, eligibility verdict, or ranking predictor.",
      statusCredit: SCORECARD_STATUS_CREDIT,
      weights: { ...SCORECARD_CHECK_WEIGHTS },
      formula:
        'score = round(100 * sum(weight_i * credit(status_i)) / sum(weight_i)) over checks with a known status, where credit is pass 1, warn 0.5, fail 0. Unknown checks are excluded from both sums. A partial or incomplete crawl caps the score below 100.',
    },
    score,
    scoreLabel: 'heuristic-check-summary',
    maxScore: 100,
    band,
    partial,
    crawlComplete,
    counts,
    weightScored,
    weightTotal,
    excluded,
    checks,
    observations,
    headline,
    caveats,
    source: {
      provider: 'seo-crawl',
      crawlStatus: report.status,
      requestEvidenceStatus: report.requestEvidenceStatus,
      startUrl: report.config.url,
      configuredMaxPages: report.config.maxPages,
      pageLimitReached: report.summary.pageLimitReached,
      evaluatedPages: pages.length,
      crawledPages: report.pages.length,
      partialReasons: geo.source.partialReasons,
    },
  }
}
