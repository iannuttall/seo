import { z } from 'zod'
import { listRules } from '../../rules.js'

export const crawlerRuleSeveritySchema = z.enum(['low', 'medium', 'high'])

export const crawlerRuleCategorySchema = z.enum([
  'canonical',
  'content',
  'response',
  'headings',
  'images',
  'indexability',
  'international',
  'links',
  'metadata',
  'mobile',
  'performance',
  'security',
  'social',
  'structured-data',
  'geo',
])

export const crawlerRuleIdSchema = z.enum(
  listRules().map((rule) => rule.id) as [string, ...string[]],
)

export const crawlerRuleInfoSchema = z.object({
  id: crawlerRuleIdSchema,
  title: z.string(),
  category: crawlerRuleCategorySchema,
  defaultSeverity: crawlerRuleSeveritySchema,
  whyItMatters: z.string(),
  howToFix: z.string(),
  impactIfIgnored: z.string(),
  howToVerify: z.string(),
  agentHints: z
    .object({
      evidenceFields: z.array(z.string()).optional(),
      suggestedCommands: z.array(z.string()).optional(),
    })
    .optional(),
})

const searchMetricsSchema = z.object({
  clicks: z.number(),
  impressions: z.number(),
  ctr: z.number(),
  position: z.number(),
})

const analyticsSchema = z.object({
  sessions: z.number(),
  totalUsers: z.number(),
  conversions: z.number(),
})

const geoSignalsSchema = z.object({
  semanticHtml: z.boolean(),
  structuredData: z.boolean(),
  hasAuthor: z.boolean(),
  hasDate: z.boolean(),
  questionHeadings: z.number().int(),
  listCount: z.number().int().optional(),
  tableCount: z.number().int().optional(),
  structuredBlocks: z.number().int(),
  answerable: z.boolean(),
  hasFaqSchema: z.boolean().optional(),
  hasQapageSchema: z.boolean().optional(),
  hasLlmsTxt: z.boolean().optional(),
  llmsTxtUrl: z.string().url().optional(),
  llmsTxtStatus: z.number().int().optional(),
})

export const crawlPageSnapshotSchema = z.object({
  url: z.string().url(),
  finalUrl: z.string().url(),
  status: z.number().int(),
  contentType: z.string().optional(),
  responseHeaders: z.record(z.string(), z.string()).optional(),
  responseTimeMs: z.number().optional(),
  sizeBytes: z.number().int().optional(),
  usedJs: z.boolean().optional(),
  fetchSource: z.enum(['cache', 'network', 'rendered']).optional(),
  cacheState: z.enum(['hit', 'miss', 'bypass']).optional(),
  fetchDiagnostics: z
    .object({
      source: z.enum(['cache', 'network', 'rendered']),
      cache: z.enum(['hit', 'miss', 'bypass']),
      fetched: z.boolean(),
      rendered: z.boolean(),
      blocked: z.boolean(),
      durationMs: z.number(),
      retries: z.number().int(),
      rateLimit: z.object({
        host: z.string(),
        concurrency: z.number().int(),
        intervalCap: z.number().int(),
        intervalMs: z.number().int(),
      }),
      backpressure: z
        .object({
          host: z.string(),
          status: z.enum(['ok', 'slowed', 'stopped']),
          reason: z.string().optional(),
          delayMs: z.number(),
          cooldownUntil: z.string().optional(),
          consecutiveSlow: z.number().int(),
          consecutiveBlocked: z.number().int(),
          consecutiveErrors: z.number().int(),
          recentP95Ms: z.number().optional(),
        })
        .optional(),
      robotsTxt: z
        .object({
          url: z.string().url(),
          cache: z.enum(['hit', 'miss', 'bypass']),
          allowed: z.boolean(),
        })
        .optional(),
      redirectChain: z
        .array(
          z.object({
            url: z.string().url(),
            status: z.number().int(),
            location: z.string().url().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  blocked: z.boolean().optional(),
  crawlDepth: z.number().int().optional(),
  error: z.string().optional(),
  robotsTxt: z
    .object({
      url: z.string().url(),
      allowed: z.boolean(),
      matchedLine: z.string().optional(),
    })
    .optional(),
  title: z.string().optional(),
  metaDescription: z.string().optional(),
  canonical: z.string().url().optional(),
  canonicalRaw: z.string().optional(),
  metaRobots: z.string().optional(),
  xRobotsTag: z.string().optional(),
  h1: z.string().optional(),
  h1Count: z.number().int().optional(),
  h2Count: z.number().int().optional(),
  h3Count: z.number().int().optional(),
  indexable: z.boolean(),
  indexability: z.string().optional(),
  wordCount: z.number().int(),
  contentHash: z.string(),
  mainContentHash: z.string().optional(),
  textRatio: z.number().min(0).max(1).optional(),
  contentSample: z.string().optional(),
  lang: z.string().optional(),
  hasViewport: z.boolean().optional(),
  isHttps: z.boolean().optional(),
  hasHsts: z.boolean().optional(),
  compression: z.string().optional(),
  hreflang: z
    .array(z.object({ hreflang: z.string(), href: z.string().url() }))
    .optional(),
  mixedContentCount: z.number().int().optional(),
  mixedContentSamples: z.array(z.string().url()).optional(),
  imagesTotal: z.number().int().optional(),
  imagesMissingAlt: z.number().int().optional(),
  oversizedImageCandidates: z
    .array(
      z.object({
        src: z.string().url(),
        width: z.number().int().optional(),
        height: z.number().int().optional(),
        detectedFrom: z.string(),
      }),
    )
    .optional(),
  outgoingInternalCount: z.number().int(),
  outgoingExternalCount: z.number().int().optional(),
  internalInlinkCount: z.number().int().optional(),
  internalLinkAuthorityScore: z.number().int().min(0).max(100).optional(),
  sampleInternalLinks: z.array(z.string().url()).optional(),
  sampleExternalLinks: z.array(z.string().url()).optional(),
  internalAnchorSamples: z
    .array(z.object({ href: z.string().url(), text: z.string() }))
    .optional(),
  externalAnchorSamples: z
    .array(z.object({ href: z.string().url(), text: z.string() }))
    .optional(),
  externalLinkChecks: z
    .array(
      z.object({
        url: z.string().url(),
        status: z.number().int().optional(),
        error: z.string().optional(),
      }),
    )
    .optional(),
  schemaTypes: z.array(z.string()).optional(),
  invalidJsonLdCount: z.number().int().optional(),
  invalidJsonLdSamples: z
    .array(z.object({ snippet: z.string(), error: z.string() }))
    .optional(),
  openGraphTitle: z.string().optional(),
  openGraphDescription: z.string().optional(),
  openGraphImage: z.string().optional(),
  twitterCard: z.string().optional(),
  author: z.string().optional(),
  hasDate: z.boolean().optional(),
  geo: geoSignalsSchema.optional(),
  searchMetrics: searchMetricsSchema.optional(),
  topQuery: searchMetricsSchema.extend({ query: z.string() }).optional(),
  seoScore: z.number().int().min(0).max(100).optional(),
  geoScore: z.number().int().min(0).max(100).optional(),
  analytics: analyticsSchema.optional(),
})

export const crawlIssueSchema = z.object({
  ruleId: crawlerRuleIdSchema,
  title: z.string(),
  category: crawlerRuleCategorySchema,
  severity: crawlerRuleSeveritySchema,
  url: z.string().url(),
  detail: z.string().optional(),
  evidence: z.record(z.string(), z.unknown()).optional(),
  searchMetrics: searchMetricsSchema.optional(),
})

export const crawlIssueGroupSchema = z.object({
  ruleId: crawlerRuleIdSchema,
  title: z.string(),
  category: crawlerRuleCategorySchema,
  severity: crawlerRuleSeveritySchema,
  count: z.number().int(),
  sampleUrls: z.array(z.string().url()),
})

export const crawlTopFixSchema = crawlIssueGroupSchema.extend({
  score: z.number(),
  scoreFactors: z.object({
    severity: z.number(),
    affectedUrls: z.number().int(),
    searchVisibleUrls: z.number().int(),
    clicks: z.number(),
    impressions: z.number(),
    sessions: z.number(),
    totalUsers: z.number(),
    conversions: z.number(),
    avgPosition: z.number().optional(),
    effort: z.enum(['low', 'medium', 'high']),
    effortScore: z.number(),
  }),
  whyThisRanks: z.string(),
  howToFix: z.string(),
  howToVerify: z.string(),
  verification: z.object({
    command: z.string(),
    expected: z.string(),
  }),
})

export const crawlConfigSchema = z.object({
  url: z.string().url(),
  mode: z.enum(['site', 'page', 'list', 'sitemap']),
  urls: z.array(z.string().url()),
  maxPages: z.number().int(),
  maxDepth: z.number().int(),
  concurrency: z.number().int(),
  timeoutMs: z.number().int(),
  include: z.array(z.string()),
  exclude: z.array(z.string()),
  respectRobots: z.boolean(),
  useSitemap: z.boolean(),
  checkExternal: z.boolean(),
  js: z.union([z.boolean(), z.literal('auto')]),
  refresh: z.boolean(),
  fetchRate: z.object({
    concurrency: z.number().int(),
    intervalCap: z.number().int().optional(),
    intervalMs: z.number().int().optional(),
    backpressure: z
      .object({
        slowMs: z.number().int().optional(),
        verySlowMs: z.number().int().optional(),
        maxConsecutiveSlow: z.number().int().optional(),
        maxConsecutiveBlocked: z.number().int().optional(),
        maxConsecutiveErrors: z.number().int().optional(),
        cooldownMs: z.number().int().optional(),
        retryAfterCapMs: z.number().int().optional(),
      })
      .optional(),
  }),
})

export const crawlReportSummarySchema = z.object({
  totalPages: z.number().int(),
  indexablePages: z.number().int(),
  nonIndexablePages: z.number().int(),
  statusErrors: z.number().int(),
  discoveredUrls: z.number().int(),
  queuedUrls: z.number().int(),
  crawledUrls: z.number().int(),
  skippedUrls: z.number().int(),
  failedUrls: z.number().int(),
  verifiedLinks: z.number().int(),
  healthScore: z.number().int().min(0).max(100),
  geoReadinessScore: z.number().int().min(0).max(100),
  highIssues: z.number().int(),
  mediumIssues: z.number().int(),
  lowIssues: z.number().int(),
  avgResponseMs: z.number().int().optional(),
  byStatus: z.record(z.string(), z.number().int()),
  byCategory: z.record(z.string(), z.number().int()),
})

export const crawlReportSchema = z.object({
  id: z.string(),
  projectId: z.string().optional(),
  site: z.string().optional(),
  ga4PropertyId: z.string().optional(),
  generatedAt: z.string().datetime(),
  status: z.enum(['completed', 'partial', 'failed']),
  configHash: z.string(),
  config: crawlConfigSchema,
  summary: crawlReportSummarySchema,
  pages: z.array(crawlPageSnapshotSchema),
  issues: z.array(crawlIssueSchema),
  issueGroups: z.array(crawlIssueGroupSchema),
  warnings: z.array(z.string()),
  caveats: z.array(z.string()),
})

export const crawlerSchemas = {
  crawlReport: crawlReportSchema,
  issueGroup: crawlIssueGroupSchema,
  topFix: crawlTopFixSchema,
  ruleInfo: crawlerRuleInfoSchema,
  pageSnapshot: crawlPageSnapshotSchema,
}

export const crawlerJsonSchemas = {
  crawlReport: z.toJSONSchema(crawlReportSchema),
  issueGroup: z.toJSONSchema(crawlIssueGroupSchema),
  topFix: z.toJSONSchema(crawlTopFixSchema),
  ruleInfo: z.toJSONSchema(crawlerRuleInfoSchema),
  pageSnapshot: z.toJSONSchema(crawlPageSnapshotSchema),
}
