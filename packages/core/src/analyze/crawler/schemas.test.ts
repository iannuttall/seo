import assert from 'node:assert/strict'
import { test } from 'node:test'
import { listRules } from '../../rules.js'
import { createCrawlReport } from './report.js'
import {
  crawlerJsonSchemas,
  crawlerSchemas,
  crawlReportSchema,
  crawlTopFixSchema,
} from './schemas.js'
import { topFixes } from './top-fixes.js'

test('crawler schemas validate report, page, rule, issue group, and top fix outputs', () => {
  const report = createCrawlReport({
    config: { url: 'https://example.com/' },
    generatedAt: '2026-06-19T00:00:00.000Z',
    pages: [
      {
        url: 'https://example.com/',
        finalUrl: 'https://example.com/',
        status: 200,
        indexable: true,
        wordCount: 100,
        contentExtraction: {
          requested: 'defuddle',
          used: 'defuddle',
          fallback: false,
          wordCountSource: 'defuddle',
          baseUrl: 'https://example.com/',
        },
        contentHash: 'hash',
        outgoingInternalCount: 0,
        fetchDiagnostics: {
          source: 'rendered',
          cache: 'bypass',
          fetched: true,
          rendered: true,
          blocked: false,
          durationMs: 120,
          retries: 0,
          rateLimit: {
            host: 'example.com',
            concurrency: 4,
            intervalCap: 4,
            intervalMs: 1_000,
          },
          rendering: {
            mode: 'on',
            status: 'rendered',
            raw: {
              source: 'network',
              cache: 'miss',
              url: 'https://example.com/',
              finalUrl: 'https://example.com/',
              status: 200,
            },
            documentDifference: {
              raw: {
                title: 'Raw title',
                canonical: { status: 'missing' },
                robots: {},
                headings: [{ level: 1, text: 'Raw heading' }],
                links: {
                  total: 1,
                  internal: 1,
                  external: 0,
                  fingerprint: 'raw-links',
                },
                content: {
                  characters: 8,
                  wordCount: 2,
                  fingerprint: 'raw-content',
                },
                structuredData: {
                  blocks: 0,
                  formats: [],
                  schemaTypes: [],
                },
              },
              rendered: {
                title: 'Rendered title',
                canonical: {
                  status: 'single',
                  url: 'https://example.com/',
                },
                robots: { meta: 'noindex' },
                headings: [{ level: 1, text: 'Rendered heading' }],
                links: {
                  total: 2,
                  internal: 1,
                  external: 1,
                  fingerprint: 'rendered-links',
                },
                content: {
                  characters: 14,
                  wordCount: 3,
                  fingerprint: 'rendered-content',
                },
                structuredData: {
                  blocks: 1,
                  formats: ['json-ld'],
                  schemaTypes: ['Article'],
                },
              },
              changed: ['title', 'canonical', 'robots', 'headings'],
            },
            browser: {
              source: 'system',
              product: 'Google Chrome',
              version: '123.0.0.0',
            },
            navigation: {
              waitUntil: 'domcontentloaded',
              networkIdleTimeoutMs: 3_000,
              networkIdleReached: true,
            },
            consoleErrors: ['Blocked by Content Security Policy'],
            securityObservations: [
              {
                kind: 'content-security-policy',
                message: 'Blocked by Content Security Policy',
              },
            ],
          },
        },
        googleRichResults: [
          {
            format: 'json-ld',
            block: 0,
            path: '$',
            schemaType: 'Product',
            feature: 'product-snippet',
            status: 'missing-required-properties',
            observedProperties: [],
            missingRequiredProperties: ['name'],
            limitations: ['Property presence only.'],
            documentationUrl:
              'https://developers.google.com/search/docs/appearance/structured-data/product-snippet',
          },
        ],
        googleRichResultsSelection: {
          limit: 50,
          eligible: 51,
          returned: 50,
          omitted: 1,
          partial: true,
          eligibleByStatus: {
            'no-required-properties': 0,
            'required-properties-observed': 50,
            'missing-required-properties': 1,
            retired: 0,
            'not-assessed': 0,
          },
          returnedByStatus: {
            'no-required-properties': 0,
            'required-properties-observed': 49,
            'missing-required-properties': 1,
            retired: 0,
            'not-assessed': 0,
          },
          omittedByStatus: {
            'no-required-properties': 0,
            'required-properties-observed': 1,
            'missing-required-properties': 0,
            retired: 0,
            'not-assessed': 0,
          },
        },
        unrecognizedJsonLdTypes: [
          {
            block: 1,
            path: '$.@type',
            value: 'Product',
            reason: 'missing-schema-context',
          },
        ],
      },
    ],
    issues: [
      {
        ruleId: 'missing_title',
        title: 'Title missing',
        category: 'metadata',
        severity: 'high',
        url: 'https://example.com/',
      },
    ],
    dataSources: {
      searchConsole: {
        status: 'partial',
        window: {
          startDate: '2026-05-19',
          endDate: '2026-06-15',
          days: 28,
        },
        totalPages: 1,
        queriedPages: 1,
        joinedMetricPages: 0,
        joinedQueryPages: 0,
        pageLimit: 5000,
        pageLimitReached: false,
        retainedRowLimit: 25_000,
        retainedRowLimitReached: true,
      },
      analytics: {
        status: 'skipped',
        totalPages: 1,
        queriedPages: 0,
        joinedPages: 0,
      },
    },
  })
  const fix = topFixes(report)[0]

  assert.doesNotThrow(() => crawlReportSchema.parse(report))
  assert.equal(
    crawlReportSchema.parse(report).dataSources?.searchConsole.status,
    'partial',
  )
  assert.doesNotThrow(() => crawlerSchemas.pageSnapshot.parse(report.pages[0]))
  assert.equal(
    crawlerSchemas.pageSnapshot.parse(report.pages[0]).contentExtraction?.used,
    'defuddle',
  )
  assert.equal(
    crawlerSchemas.pageSnapshot.parse(report.pages[0]).fetchDiagnostics
      ?.rendering?.browser?.product,
    'Google Chrome',
  )
  assert.equal(
    crawlerSchemas.pageSnapshot.parse(report.pages[0]).googleRichResults?.[0]
      ?.status,
    'missing-required-properties',
  )
  assert.deepEqual(
    crawlerSchemas.pageSnapshot.parse(report.pages[0])
      .googleRichResultsSelection,
    report.pages[0]?.googleRichResultsSelection,
  )
  assert.equal(
    crawlerSchemas.pageSnapshot.parse(report.pages[0])
      .unrecognizedJsonLdTypes?.[0]?.reason,
    'missing-schema-context',
  )
  assert.doesNotThrow(() =>
    crawlerSchemas.issueGroup.parse(report.issueGroups[0]),
  )
  assert.doesNotThrow(() => crawlerSchemas.ruleInfo.parse(listRules()[0]))
  assert.throws(() =>
    crawlerSchemas.requestObservation.parse({
      requestedUrl: 'https://example.com/',
      outcome: 'response',
      finalUrl: 'https://example.com/',
      status: 200,
      extraction: 'failed',
    }),
  )
  assert.throws(() =>
    crawlerSchemas.crawlReport.parse({
      ...report,
      requestEvidenceStatus: 'available',
      requests: undefined,
    }),
  )
  assert.throws(() =>
    crawlerSchemas.crawlReport.parse({
      ...report,
      requestEvidenceStatus: 'unavailable',
      requests: [
        {
          requestedUrl: 'https://example.com/',
          outcome: 'response',
          finalUrl: 'https://example.com/',
          status: 200,
          extraction: 'complete',
        },
      ],
    }),
  )
  assert.ok(fix)
  assert.doesNotThrow(() => crawlTopFixSchema.parse(fix))
})

test('crawler JSON schemas expose deterministic object contracts', () => {
  const reportVariants = crawlerJsonSchemas.crawlReport.oneOf as Array<{
    type?: string
    properties?: Record<string, unknown>
  }>
  assert.equal(reportVariants.length, 3)
  assert.equal(
    reportVariants.every(
      (variant) => variant.type === 'object' && variant.properties?.summary,
    ),
    true,
  )
  assert.equal(
    reportVariants.every((variant) => variant.properties?.dataSources),
    true,
  )
  assert.equal(crawlerJsonSchemas.pageSnapshot.type, 'object')
  assert.equal(crawlerJsonSchemas.ruleInfo.type, 'object')
  assert.ok(crawlerJsonSchemas.topFix.properties?.scoreFactors)
})
