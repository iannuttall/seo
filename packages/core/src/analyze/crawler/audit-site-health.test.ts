import assert from 'node:assert/strict'
import { test } from 'node:test'
import { auditCrawlPages } from './audit.js'
import { crawlPage as page } from './audit.test-fixtures.js'

test('crawl audit reports high-confidence login gates and empty initial HTML', () => {
  const issues = auditCrawlPages([
    page({
      softAuthenticationGate: {
        kind: 'login-form',
        indicators: ['login-title'],
      },
      fetchDiagnostics: {
        source: 'rendered',
        cache: 'bypass',
        fetched: true,
        rendered: true,
        blocked: false,
        durationMs: 20,
        retries: 0,
        rateLimit: {
          host: 'example.com',
          concurrency: 1,
          intervalCap: 1,
          intervalMs: 1_000,
        },
        rendering: {
          mode: 'auto',
          status: 'rendered',
          documentDifference: {
            changed: ['content'],
            raw: {
              canonical: { status: 'missing' },
              robots: {},
              headings: [],
              links: { total: 0, internal: 0, external: 0, fingerprint: 'raw' },
              content: { characters: 40, wordCount: 3, fingerprint: 'raw' },
              structuredData: { blocks: 0, formats: [], schemaTypes: [] },
            },
            rendered: {
              canonical: { status: 'missing' },
              robots: {},
              headings: [{ level: 1, text: 'Useful page' }],
              links: {
                total: 4,
                internal: 4,
                external: 0,
                fingerprint: 'rendered',
              },
              content: {
                characters: 900,
                wordCount: 150,
                fingerprint: 'rendered',
              },
              structuredData: { blocks: 0, formats: [], schemaTypes: [] },
            },
          },
        },
      },
    }),
  ])

  assert.equal(
    issues.filter((issue) => issue.ruleId === 'soft_authentication_gate')
      .length,
    1,
  )
  assert.equal(
    issues.filter((issue) => issue.ruleId === 'client_rendered_content').length,
    1,
  )
})
