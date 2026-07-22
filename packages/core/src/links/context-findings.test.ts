import assert from 'node:assert/strict'
import test from 'node:test'
import { linkTargetFindings } from './context-findings.js'
import type { LinkTargetContextRow } from './context-types.js'

function row(input: {
  targetUrl: string
  observedLinks: number
  status?: number
  finalUrl?: string
  canonical?: string | null
  indexable?: boolean
  clicks?: number
  impressions?: number
}): LinkTargetContextRow {
  return {
    targetUrl: input.targetUrl,
    observedLinks: input.observedLinks,
    crawl: {
      state: 'observed',
      reportId: 'crawl-1',
      observedAt: '2026-07-20T10:00:00.000Z',
      status: input.status ?? 200,
      finalUrl: input.finalUrl ?? input.targetUrl,
      indexable: input.indexable ?? true,
      canonical: input.canonical ?? null,
      issueIds: [],
    },
    searchConsole:
      input.clicks !== undefined || input.impressions !== undefined
        ? {
            state: 'observed',
            clicks: input.clicks ?? 0,
            impressions: input.impressions ?? 0,
            ctr: 0,
            position: 0,
          }
        : { state: 'not-retained', reason: 'No retained row.' },
  }
}

test('link target findings cover each technical state with evidence-based priority', () => {
  const rows = [
    row({
      targetUrl: 'https://example.com/non-indexable',
      observedLinks: 5,
      indexable: false,
    }),
    row({
      targetUrl: 'https://example.com/canonical',
      observedLinks: 1,
      canonical: 'https://example.com/preferred',
    }),
    row({
      targetUrl: 'https://example.com/redirect',
      observedLinks: 1,
      finalUrl: 'https://example.com/final',
      impressions: 100,
    }),
    row({
      targetUrl: 'https://example.com/broken',
      observedLinks: 1,
      status: 404,
      indexable: false,
    }),
  ]

  const forward = linkTargetFindings(rows)
  const reverse = linkTargetFindings([...rows].reverse())

  assert.deepEqual(forward, reverse)
  assert.deepEqual(
    forward.map((finding) => [finding.code, finding.priority]),
    [
      ['linked-broken-target', 'high'],
      ['linked-redirect-target', 'high'],
      ['linked-non-indexable-target', 'medium'],
      ['linked-canonical-conflict', 'low'],
    ],
  )
  assert.ok(forward.every((finding) => finding.heuristic))
  assert.ok(forward.every((finding) => finding.verify.length > 0))
})

test('link target findings retain at most fifty deterministic rows', () => {
  const result = linkTargetFindings(
    Array.from({ length: 75 }, (_, index) =>
      row({
        targetUrl: `https://example.com/broken-${String(index).padStart(2, '0')}`,
        observedLinks: 1,
        status: 404,
      }),
    ).reverse(),
  )

  assert.equal(result.length, 50)
  assert.equal(result[0]?.targetUrl, 'https://example.com/broken-00')
  assert.equal(result[49]?.targetUrl, 'https://example.com/broken-49')
})
