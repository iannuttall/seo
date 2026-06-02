import assert from 'node:assert/strict'
import { test } from 'node:test'
import { monitoringBullets } from './reports/sections.js'

test('monitoringBullets includes saved link recovery summary', () => {
  const bullets = monitoringBullets({
    monitoring: {
      crawlRuns: [],
      indexWatch: {
        inspectedUrls: 0,
        nonPass: 0,
        blocked: 0,
      },
      linkRecover: {
        id: 'run-1',
        site: 'sc-domain:example.com',
        createdAt: '2026-01-01T00:00:00.000Z',
        range: {
          startDate: '2025-12-01',
          endDate: '2025-12-31',
          days: 31,
        },
        checked: 10,
        recoverable: 2,
        high: 1,
        medium: 1,
        low: 0,
        clicksAtRisk: 42,
        impressionsAtRisk: 1200,
        topIssue: 'final-4xx',
        topUrl: 'https://example.com/old/',
        topAction: 'Add a 301 redirect.',
        repeatedUrls: 1,
        repeatedTopUrl: 'https://example.com/old/',
      },
    },
  })

  assert.equal(
    bullets.some((line) =>
      line.includes('Latest link-recover checked 10 search-value URLs'),
    ),
    true,
  )
  assert.equal(
    bullets.some((line) => line.includes('Top recovery target')),
    true,
  )
  assert.equal(
    bullets.some((line) => line.includes('appeared in multiple recent')),
    true,
  )
})

test('monitoringBullets includes saved crawl recommendations', () => {
  const bullets = monitoringBullets({
    monitoring: {
      crawlRuns: [
        {
          id: 'crawl-1',
          site: 'sc-domain:example.com',
          startUrl: 'https://example.com/',
          createdAt: '2026-01-01T00:00:00.000Z',
          limit: 10,
          urlCount: 10,
          statusErrors: 1,
          nonIndexable: 1,
          recommendations: 1,
          highPriorityRecommendations: 1,
          topRecommendation: {
            url: 'https://example.com/broken/',
            title: 'Search-visible URL now returns an error',
            action: 'Restore the page or add a direct 301.',
            severity: 'high',
          },
        },
      ],
      indexWatch: {
        inspectedUrls: 0,
        nonPass: 0,
        blocked: 0,
      },
      linkRecover: undefined,
    },
  })

  assert.equal(
    bullets.some((line) => line.includes('high-priority crawl action')),
    true,
  )
  assert.equal(
    bullets.some((line) => line.includes('Top crawl action')),
    true,
  )
})
