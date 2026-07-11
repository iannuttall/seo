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

const googleRichResultAssessmentStatusSchema = z.enum([
  'no-required-properties',
  'required-properties-observed',
  'missing-required-properties',
  'retired',
  'not-assessed',
])

const googleRichResultStatusCountsSchema = z.object({
  'no-required-properties': z.number().int().nonnegative(),
  'required-properties-observed': z.number().int().nonnegative(),
  'missing-required-properties': z.number().int().nonnegative(),
  retired: z.number().int().nonnegative(),
  'not-assessed': z.number().int().nonnegative(),
})

const googleRichResultAssessmentSchema = z.object({
  format: z.enum(['json-ld', 'microdata', 'rdfa']),
  block: z.number().int().nonnegative().optional(),
  path: z.string(),
  schemaType: z.enum([
    'Article',
    'BlogPosting',
    'NewsArticle',
    'Product',
    'BreadcrumbList',
    'FAQPage',
  ]),
  feature: z.enum(['article', 'product-snippet', 'breadcrumb', 'faq']),
  status: googleRichResultAssessmentStatusSchema,
  observedProperties: z.array(z.string()),
  missingRequiredProperties: z.array(z.string()),
  limitations: z.array(z.string()),
  documentationUrl: z.string().url(),
})

const canonicalStatusSchema = z.enum([
  'missing',
  'single',
  'duplicate',
  'conflicting',
  'outside-head-only',
  'invalid',
])

const renderingDocumentSnapshotSchema = z.object({
  title: z.string().optional(),
  metaDescription: z.string().optional(),
  canonical: z.object({
    status: canonicalStatusSchema,
    url: z.string().url().optional(),
  }),
  robots: z.object({
    meta: z.string().optional(),
    googlebot: z.string().optional(),
    http: z.string().optional(),
  }),
  headings: z.array(z.object({ level: z.number().int(), text: z.string() })),
  links: z.object({
    total: z.number().int().nonnegative(),
    internal: z.number().int().nonnegative(),
    external: z.number().int().nonnegative(),
    fingerprint: z.string(),
  }),
  content: z.object({
    characters: z.number().int().nonnegative(),
    wordCount: z.number().int().nonnegative(),
    fingerprint: z.string(),
  }),
  structuredData: z.object({
    blocks: z.number().int().nonnegative(),
    formats: z.array(z.enum(['json-ld', 'microdata', 'rdfa'])),
    schemaTypes: z.array(z.string()),
  }),
})

const renderingDocumentDifferenceSchema = z.object({
  raw: renderingDocumentSnapshotSchema,
  rendered: renderingDocumentSnapshotSchema,
  changed: z.array(
    z.enum([
      'title',
      'metaDescription',
      'canonical',
      'robots',
      'headings',
      'links',
      'content',
      'structuredData',
    ]),
  ),
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
          allowed: z.boolean().nullable(),
          availability: z.enum([
            'available',
            'absent',
            'access-blocked',
            'rate-limited',
            'unreachable',
          ]),
          status: z.number().int().optional(),
          error: z.string().optional(),
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
      rendering: z
        .object({
          mode: z.enum(['auto', 'on', 'off']),
          status: z.enum([
            'not-requested',
            'not-needed',
            'skipped',
            'rendered',
            'unavailable',
            'failed',
          ]),
          raw: z
            .object({
              source: z.enum(['cache', 'network']),
              cache: z.enum(['hit', 'miss', 'bypass']),
              url: z.string().url(),
              finalUrl: z.string().url(),
              status: z.number().int(),
            })
            .optional(),
          documentDifference: renderingDocumentDifferenceSchema.optional(),
          browser: z
            .object({
              source: z.enum(['environment', 'playwright-cache', 'system']),
              product: z.string(),
              version: z.string().optional(),
            })
            .optional(),
          navigation: z
            .object({
              waitUntil: z.literal('domcontentloaded'),
              networkIdleTimeoutMs: z.number().int().nonnegative(),
              networkIdleReached: z.boolean(),
            })
            .optional(),
          consoleErrors: z.array(z.string()).optional(),
          pageErrors: z.array(z.string()).optional(),
          failedRequests: z
            .array(
              z.object({
                url: z.string(),
                resourceType: z.string(),
                error: z.string(),
              }),
            )
            .optional(),
          securityObservations: z
            .array(
              z.object({
                kind: z.enum([
                  'content-security-policy',
                  'cors',
                  'mixed-content',
                ]),
                message: z.string(),
              }),
            )
            .optional(),
          error: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  blocked: z.boolean().optional(),
  contentAuditAllowed: z.boolean().optional(),
  crawlDepth: z.number().int().optional(),
  error: z.string().optional(),
  robotsTxt: z
    .object({
      url: z.string().url(),
      allowed: z.boolean().nullable(),
      availability: z.enum([
        'available',
        'absent',
        'access-blocked',
        'rate-limited',
        'unreachable',
      ]),
      status: z.number().int().optional(),
      error: z.string().optional(),
      matchedLine: z.string().optional(),
    })
    .optional(),
  title: z.string().optional(),
  metaDescription: z.string().optional(),
  canonical: z.string().url().optional(),
  canonicalRaw: z.string().optional(),
  canonicalStatus: z
    .enum([
      'missing',
      'single',
      'duplicate',
      'conflicting',
      'outside-head-only',
      'invalid',
    ])
    .optional(),
  canonicalCandidates: z
    .array(
      z.object({
        source: z.enum(['html-head', 'html-body', 'http-header']),
        raw: z.string(),
        resolved: z.string().url().optional(),
        ignoredReason: z
          .enum([
            'outside-head',
            'alternate-qualifier',
            'fragment',
            'invalid-url',
            'non-http-url',
          ])
          .optional(),
      }),
    )
    .optional(),
  metaRobots: z.string().optional(),
  xRobotsTag: z.string().optional(),
  h1: z.string().optional(),
  h1Count: z.number().int().optional(),
  h2Count: z.number().int().optional(),
  h3Count: z.number().int().optional(),
  indexable: z.boolean(),
  indexability: z.string().optional(),
  declaredIndexability: z
    .enum([
      'indexable-candidate',
      'noindex',
      'robots-blocked',
      'canonical-conflict',
      'canonical-hint-other',
      'not-html',
      'unknown',
    ])
    .optional(),
  extractionStatus: z
    .enum(['complete', 'failed', 'not-applicable', 'unknown-media-type'])
    .optional(),
  extractionError: z.string().optional(),
  wordCount: z.number().int(),
  contentExtraction: z
    .object({
      requested: z.enum(['defuddle', 'readability']),
      used: z.enum(['defuddle', 'readability']),
      fallback: z.boolean(),
      fallbackReason: z.enum(['defuddle_error', 'defuddle_empty']).optional(),
      fallbackDetail: z.string().optional(),
      wordCountSource: z.enum(['defuddle', 'local_cjk_aware']),
      baseUrl: z.string().url(),
      extractorType: z.string().optional(),
    })
    .optional(),
  warnings: z.array(z.string()).optional(),
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
  structuredDataFormats: z
    .array(z.enum(['json-ld', 'microdata', 'rdfa']))
    .optional(),
  googleRichResults: z.array(googleRichResultAssessmentSchema).optional(),
  googleRichResultsSelection: z
    .object({
      limit: z.number().int().nonnegative(),
      eligible: z.number().int().nonnegative(),
      returned: z.number().int().nonnegative(),
      omitted: z.number().int().nonnegative(),
      partial: z.boolean(),
      eligibleByStatus: googleRichResultStatusCountsSchema,
      returnedByStatus: googleRichResultStatusCountsSchema,
      omittedByStatus: googleRichResultStatusCountsSchema,
    })
    .optional(),
  schemaSameAs: z.array(z.string().url()).optional(),
  schemaSameAsEvidence: z
    .array(
      z.object({
        url: z.string().url(),
        block: z.number().int().nonnegative(),
        path: z.string(),
        subjectId: z.string().url().optional(),
        subjectTypes: z.array(z.string()),
      }),
    )
    .optional(),
  invalidSchemaSameAs: z
    .array(
      z.object({
        block: z.number().int().nonnegative(),
        path: z.string(),
        value: z.string(),
      }),
    )
    .optional(),
  socialProfileLinks: z.array(z.string().url()).optional(),
  invalidJsonLdCount: z.number().int().optional(),
  invalidJsonLdSamples: z
    .array(z.object({ snippet: z.string(), error: z.string() }))
    .optional(),
  unrecognizedJsonLdTypes: z
    .array(
      z.object({
        block: z.number().int().nonnegative(),
        path: z.string(),
        value: z.string(),
        reason: z.enum([
          'missing-schema-context',
          'unresolved-context',
          'unsupported-vocabulary',
        ]),
      }),
    )
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
  analytics: analyticsSchema.optional(),
})

const crawlResponseObservationBaseSchema = z.object({
  requestedUrl: z.string().url(),
  outcome: z.literal('response'),
  finalUrl: z.string().url(),
  status: z.number().int(),
  contentType: z.string().optional(),
  durationMs: z.number().optional(),
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

export const crawlRequestObservationSchema = z.union([
  crawlResponseObservationBaseSchema.extend({
    extraction: z.enum(['complete', 'not-applicable', 'unknown-media-type']),
  }),
  crawlResponseObservationBaseSchema.extend({
    extraction: z.literal('failed'),
    extractionError: z.string(),
  }),
  z.object({
    requestedUrl: z.string().url(),
    outcome: z.literal('skipped'),
    durationMs: z.number().optional(),
    reason: z.enum(['robots-disallowed', 'robots-deferred']),
    robotsTxt: z.object({
      url: z.string().url(),
      allowed: z.boolean().nullable(),
      availability: z.enum([
        'available',
        'absent',
        'access-blocked',
        'rate-limited',
        'unreachable',
      ]),
      status: z.number().int().optional(),
      error: z.string().optional(),
      matchedLine: z.string().optional(),
    }),
    extraction: z.literal('not-applicable'),
  }),
  z.object({
    requestedUrl: z.string().url(),
    outcome: z.literal('failure'),
    durationMs: z.number().optional(),
    failureKind: z.enum([
      'dns',
      'tls',
      'timeout',
      'redirect-limit',
      'aborted',
      'unknown',
    ]),
    error: z.string(),
    extraction: z.literal('not-applicable'),
  }),
])

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

const crawlAiSignalsSchema = z.object({
  robotsTxt: z
    .object({
      url: z.string().url(),
      exists: z.boolean(),
      availability: z.enum([
        'available',
        'absent',
        'access-blocked',
        'rate-limited',
        'unreachable',
      ]),
      status: z.number().int().optional(),
      error: z.string().optional(),
      sitemapUrls: z.array(z.string().url()),
      botAccess: z.array(
        z.object({
          userAgent: z.string(),
          allowed: z.boolean().nullable(),
          declared: z.boolean(),
          coveredByWildcard: z.boolean(),
        }),
      ),
    })
    .optional(),
  llmsTxt: z
    .object({
      url: z.string().url(),
      exists: z.boolean(),
      status: z.number().int().optional(),
    })
    .optional(),
  agentResources: z
    .array(
      z.object({
        url: z.string().url(),
        exists: z.boolean(),
        status: z.number().int().optional(),
        contentType: z.string().optional(),
        validJson: z.boolean().optional(),
      }),
    )
    .optional(),
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
  js: z.union([z.enum(['auto', 'on', 'off']), z.boolean()]),
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
  pageLimitReached: z.boolean().default(false),
  attemptedRequests: z.number().int(),
  responseRequests: z.number().int(),
  failedRequests: z.number().int(),
  abortedRequests: z.number().int(),
  extractionFailures: z.number().int(),
  requestByStatus: z.record(z.string(), z.number().int()),
  avgRequestMs: z.number().int().optional(),
  highIssues: z.number().int(),
  mediumIssues: z.number().int(),
  lowIssues: z.number().int(),
  avgResponseMs: z.number().int().optional(),
  byStatus: z.record(z.string(), z.number().int()),
  byCategory: z.record(z.string(), z.number().int()),
})

const crawlDataSourceStatusSchema = z.enum([
  'joined',
  'partial',
  'none',
  'skipped',
  'unavailable',
])

const crawlDataSourceWindowSchema = z.object({
  startDate: z.string().date(),
  endDate: z.string().date(),
  days: z.number().int().positive(),
})

const crawlSearchDataSourceSchema = z.object({
  status: crawlDataSourceStatusSchema,
  window: crawlDataSourceWindowSchema.optional(),
  totalPages: z.number().int().nonnegative(),
  queriedPages: z.number().int().nonnegative(),
  joinedMetricPages: z.number().int().nonnegative(),
  joinedQueryPages: z.number().int().nonnegative(),
  pageLimit: z.number().int().positive(),
  pageLimitReached: z.boolean(),
  metricRowsReturned: z.number().int().nonnegative().optional(),
  queryRowsReturned: z.number().int().nonnegative().optional(),
  retainedRowLimit: z.number().int().positive().optional(),
  retainedRowLimitReached: z.boolean().optional(),
  warning: z.string().optional(),
})

const crawlAnalyticsDataSourceSchema = z.object({
  status: crawlDataSourceStatusSchema,
  window: crawlDataSourceWindowSchema.optional(),
  totalPages: z.number().int().nonnegative(),
  queriedPages: z.number().int().nonnegative(),
  joinedPages: z.number().int().nonnegative(),
  returnedRows: z.number().int().nonnegative().optional(),
  availableRows: z.number().int().nonnegative().optional(),
  retainedRowLimit: z.number().int().positive().optional(),
  retainedRowLimitReached: z.boolean().optional(),
  warning: z.string().optional(),
})

const crawlReportDataSourcesSchema = z.object({
  searchConsole: crawlSearchDataSourceSchema,
  analytics: crawlAnalyticsDataSourceSchema,
})

const crawlReportBaseSchema = z.object({
  id: z.string(),
  definitionId: z.string(),
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
  dataSources: crawlReportDataSourcesSchema.optional(),
  ai: crawlAiSignalsSchema.optional(),
  warnings: z.array(z.string()),
  caveats: z.array(z.string()),
})

export const crawlReportSchema = z.discriminatedUnion('requestEvidenceStatus', [
  crawlReportBaseSchema.extend({
    requestEvidenceStatus: z.literal('available'),
    requests: z.array(crawlRequestObservationSchema),
  }),
  crawlReportBaseSchema.extend({
    requestEvidenceStatus: z.literal('partial'),
    requests: z.array(crawlRequestObservationSchema),
  }),
  crawlReportBaseSchema.extend({
    requestEvidenceStatus: z.literal('unavailable'),
    requests: z.array(crawlRequestObservationSchema).max(0),
  }),
])

export const crawlerSchemas = {
  crawlReport: crawlReportSchema,
  issueGroup: crawlIssueGroupSchema,
  topFix: crawlTopFixSchema,
  ruleInfo: crawlerRuleInfoSchema,
  requestObservation: crawlRequestObservationSchema,
  pageSnapshot: crawlPageSnapshotSchema,
}

export const crawlerJsonSchemas = {
  crawlReport: z.toJSONSchema(crawlReportSchema),
  issueGroup: z.toJSONSchema(crawlIssueGroupSchema),
  topFix: z.toJSONSchema(crawlTopFixSchema),
  ruleInfo: z.toJSONSchema(crawlerRuleInfoSchema),
  requestObservation: z.toJSONSchema(crawlRequestObservationSchema),
  pageSnapshot: z.toJSONSchema(crawlPageSnapshotSchema),
}
