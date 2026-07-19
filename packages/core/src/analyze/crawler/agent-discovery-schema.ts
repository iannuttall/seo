import { z } from 'zod'

const agentRepresentationResponseSchema = z.object({
  requestedUrl: z.string().url(),
  finalUrl: z.string().url().optional(),
  status: z.number().int().optional(),
  contentType: z.string().optional(),
  bytes: z.number().int().nonnegative().optional(),
  characters: z.number().int().nonnegative().optional(),
  estimatedTokens: z.number().int().nonnegative().optional(),
  sha256: z.string().optional(),
  canonicalUrl: z.string().url().optional(),
  alternateUrl: z.string().url().optional(),
  varyAccept: z.boolean(),
  markdownTokens: z.number().int().nonnegative().optional(),
  contentSignal: z.string().optional(),
  error: z.string().optional(),
})

export const agentDiscoverySchema = z.object({
  profile: z.literal('content'),
  profileApplicability: z.record(
    z.enum(['content', 'api', 'application', 'commerce']),
    z.object({
      status: z.enum(['evaluated', 'notApplicable']),
      reason: z.string(),
    }),
  ),
  dataStatus: z.enum(['complete', 'partial', 'unavailable']),
  markdownAlternates: z.object({
    eligibleHtmlPages: z.number().int().nonnegative(),
    advertisedPages: z.number().int().nonnegative(),
    evaluatedPages: z.number().int().nonnegative(),
    exactByteMatches: z.number().int().nonnegative(),
    stableResponses: z.number().int().nonnegative(),
    pages: z.array(
      z.object({
        htmlUrl: z.string().url(),
        advertisedUrls: z.array(z.string().url()),
        htmlAlternateUnique: z.boolean(),
        httpAlternateUrls: z.array(z.string().url()),
        explicit: agentRepresentationResponseSchema.optional(),
        negotiated: agentRepresentationResponseSchema.optional(),
        repeated: agentRepresentationResponseSchema.optional(),
        explicitMatchesNegotiated: z.boolean().nullable(),
        repeatedHashStable: z.boolean().nullable(),
        markdownCanonicalMatchesHtml: z.boolean().nullable(),
        quality: z
          .object({
            frontmatterTitle: z.boolean(),
            h1Count: z.number().int().nonnegative(),
            codeFenceBalanced: z.boolean(),
            tableRows: z.number().int().nonnegative(),
            links: z.number().int().nonnegative(),
            wordCount: z.number().int().nonnegative(),
            rawHtmlTags: z.number().int().nonnegative(),
            rawSvgTags: z.number().int().nonnegative(),
            rawScriptTags: z.number().int().nonnegative(),
            rawStyleTags: z.number().int().nonnegative(),
            suspiciousConcatenations: z.number().int().nonnegative(),
            repeatedLines: z.number().int().nonnegative(),
            sourceWordCount: z.number().int().nonnegative(),
            wordRetentionRatio: z.number().nonnegative().nullable(),
            introductoryCopyRetained: z.boolean().nullable(),
            navigationOnly: z.boolean(),
            contentSketchCoverage: z
              .number()
              .min(0)
              .max(1)
              .nullable()
              .optional(),
            tabbedContent: z
              .object({
                detectedPanels: z.number().int().nonnegative(),
                evaluatedPanels: z.number().int().nonnegative(),
                retainedPanels: z.number().int().nonnegative(),
                missingPanels: z.number().int().nonnegative(),
                complete: z.boolean().nullable(),
              })
              .optional(),
          })
          .optional(),
      }),
    ),
  }),
  contentNegotiation: z.object({
    qZeroHonoured: z.boolean().nullable(),
    qZeroStatus: z.number().int().optional(),
    qZeroContentType: z.string().optional(),
    error: z.string().optional(),
  }),
  routeManifest: z.object({
    url: z.string().url(),
    status: z.number().int().optional(),
    valid: z.boolean(),
    declaredHtmlRoutes: z.array(z.string()),
    declaredMarkdownRoutes: z.array(z.string()),
    missingHtmlRoutes: z.array(z.string()),
    missingMarkdownRoutes: z.array(z.string()),
    orphanMarkdownRoutes: z.array(z.string()),
    comparisonStatus: z
      .enum(['complete', 'partial', 'not-applicable'])
      .optional(),
    error: z.string().optional(),
  }),
  agentSkills: z.object({
    indexUrl: z.string().url(),
    status: z.number().int().optional(),
    contentType: z.string().optional(),
    cors: z.string().optional(),
    validIndex: z.boolean(),
    skills: z.array(
      z.object({
        name: z.string().optional(),
        url: z.string().url().optional(),
        status: z.number().int().optional(),
        contentType: z.string().optional(),
        declaredDigest: z.string().optional(),
        observedDigest: z.string().optional(),
        digestMatches: z.boolean().nullable(),
        frontmatterValid: z.boolean().nullable(),
        sameOrigin: z.boolean(),
        cors: z.string().optional(),
        error: z.string().optional(),
      }),
    ),
    error: z.string().optional(),
  }),
  llmsTxt: z.object({
    url: z.string().url(),
    exists: z.boolean(),
    status: z.number().int().optional(),
    contentType: z.string().optional(),
    bytes: z.number().int().nonnegative().optional(),
    sha256: z.string().optional(),
    repeatedHashStable: z.boolean().nullable(),
    headingCount: z.number().int().nonnegative(),
    totalParsedLinks: z.number().int().nonnegative(),
    linkLimitReached: z.boolean(),
    links: z.array(
      z.object({
        label: z.string(),
        url: z.string().url(),
        sameOrigin: z.boolean(),
        status: z.number().int().optional(),
        finalUrl: z.string().url().optional(),
        redirected: z.boolean(),
        indexableTarget: z.boolean().optional(),
        error: z.string().optional(),
      }),
    ),
    invalidLinks: z.array(z.string()),
    duplicateLinks: z.array(z.string().url()),
    offSiteLinks: z.array(z.string().url()),
    redirectedLinks: z.array(z.string().url()),
    nonIndexableLinks: z.array(z.string().url()),
    missingCrawlRoutes: z.array(z.string().url()),
    oversized: z.boolean(),
    error: z.string().optional(),
  }),
  contentSignals: z.object({
    htmlValues: z.array(z.string()),
    markdownValues: z.array(z.string()),
    missingHtmlPages: z.number().int().nonnegative(),
    missingMarkdownPages: z.number().int().nonnegative(),
    consistent: z.boolean().nullable(),
  }),
  endpointDiscovery: z
    .object({
      linkHeader: z.object({
        url: z.string().url(),
        status: z.number().int().optional(),
        entries: z.array(
          z.object({
            url: z.string().url(),
            rel: z.array(z.string()),
            type: z.string().optional(),
          }),
        ),
        registeredRels: z.array(z.string()),
        emergingRels: z.array(z.string()),
        error: z.string().optional(),
      }),
      endpoints: z.array(
        z.object({
          id: z.string(),
          url: z.string().url(),
          status: z.number().int().optional(),
          exists: z.boolean(),
          contentType: z.string().optional(),
          validJson: z.boolean().optional(),
          presentFields: z.array(z.string()).optional(),
          missingFields: z.array(z.string()).optional(),
          error: z.string().optional(),
        }),
      ),
    })
    .optional(),
  protocolVariants: z.object({
    http: z.object({
      url: z.string().url(),
      status: z.number().int().optional(),
      location: z.string().url().optional(),
      permanentRedirectToHttps: z.boolean().nullable(),
      error: z.string().optional(),
    }),
    www: z.object({
      url: z.string().url(),
      status: z.number().int().optional(),
      location: z.string().url().optional(),
      redirectsToPreferredHost: z.boolean().nullable(),
      error: z.string().optional(),
    }),
    hstsOnStartPage: z.boolean().nullable(),
  }),
  warnings: z.array(z.string()),
})
