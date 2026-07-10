import assert from 'node:assert/strict'
import test from 'node:test'
import { updatePostmortemCsvFiles } from '../../export/update-postmortem.js'
import type { GscRow } from '../../types.js'
import {
  compareSegmentRows,
  type SegmentImpactItem,
} from '../segment-impact.js'
import type { UpdateCorrelationReport } from '../traffic-anomaly.js'
import {
  inferTemplateMovement,
  updatePostmortemWorkflow,
} from './update-postmortem.js'

function updateFixture(): UpdateCorrelationReport {
  return {
    attribution: 'weak-or-no-overlap',
    confidence: 'low',
    classification: 'not-enough-evidence',
    summary: 'No update attribution evidence.',
    overlappingUpdates: [],
    evidence: [],
    confounders: [],
  } as unknown as UpdateCorrelationReport
}

function pageRow(key: string, clicks: number): GscRow {
  return {
    keys: [key],
    clicks,
    impressions: clicks * 10,
    ctr: 0.1,
    position: 5,
  }
}

test('postmortem marks empty segment evidence as skipped and unavailable', async () => {
  const report = await updatePostmortemWorkflow(
    { site: 'sc-domain:example.com' },
    {
      updateCorrelation: async () => updateFixture(),
      segmentImpact: async (input) =>
        compareSegmentRows({
          site: input.site,
          dimension: input.dimension ?? 'page',
          before: { startDate: '2026-04-01', endDate: '2026-04-28' },
          after: { startDate: '2026-04-29', endDate: '2026-05-26' },
          beforeRows: [],
          afterRows: [],
        }),
    },
  )

  assert.match(report.summary, /page segment evidence unavailable/)
  assert.equal(report.steps[1]?.status, 'skipped')
  assert.equal(report.output.insights[0]?.dataStatus, 'empty')
  assert.match(
    report.output.insights[0]?.summary ?? '',
    /no matched retained segment movement was available/,
  )
})

test('postmortem CSV preserves segment status and unmatched evidence', async () => {
  const report = await updatePostmortemWorkflow(
    { site: 'sc-domain:example.com' },
    {
      updateCorrelation: async () => updateFixture(),
      segmentImpact: async (input) =>
        compareSegmentRows({
          site: input.site,
          dimension: input.dimension ?? 'page',
          before: { startDate: '2026-04-01', endDate: '2026-04-28' },
          after: { startDate: '2026-04-29', endDate: '2026-05-26' },
          beforeRows: [pageRow('matched', 10), pageRow('before-only', 5)],
          afterRows: [pageRow('matched', 20)],
        }),
    },
  )
  const files = updatePostmortemCsvFiles(report)
  const summary = files.find(
    (file) => file.filename === 'postmortem-summary.csv',
  )
  const pageSegments = files.find(
    (file) => file.filename === 'postmortem-segment-page.csv',
  )
  const unmatched = files.find(
    (file) => file.filename === 'postmortem-segment-page-unmatched.csv',
  )

  assert.equal(summary?.rows[0]?.page_segment_status, 'partial')
  assert.match(
    String(summary?.rows[0]?.page_segment_warnings),
    /not treated as zero/,
  )
  assert.equal(
    pageSegments?.rows[0]?.evidence_scope,
    'matched-retained-segment',
  )
  assert.equal(unmatched?.rows[0]?.retained_in, 'before')
  assert.equal(unmatched?.rows[0]?.reason, 'not-retained-in-other-window')
})

test('inferTemplateMovement surfaces repeated winning URL patterns', () => {
  const movement = inferTemplateMovement({
    winners: [
      page('https://example.com/cities/london/', 120),
      page('https://example.com/cities/paris/', 90),
      page('https://example.com/cities/rome/', 80),
      page('https://example.com/cities/madrid/', 70),
      page('https://example.com/blog/product-launch/', 10),
      page('https://example.com/docs/getting-started/', 5),
    ],
    losers: [],
  })

  assert.equal(movement.length, 1)
  assert.equal(movement[0]?.signature, '/cities/:value')
  assert.equal(movement[0]?.direction, 'winner')
  assert.equal(movement[0]?.urlCount, 4)
  assert.match(movement[0]?.summary ?? '', /gained 360 clicks/)
})

test('inferTemplateMovement stays quiet for sparse one-off pages', () => {
  const movement = inferTemplateMovement({
    winners: [
      page('https://example.com/pricing/', 120),
      page('https://example.com/about/', 80),
      page('https://example.com/blog/founder-note/', 60),
    ],
    losers: [page('https://example.com/docs/install/', -40)],
  })

  assert.deepEqual(movement, [])
})

test('inferTemplateMovement explains broad slug patterns with common terms', () => {
  const movement = inferTemplateMovement({
    winners: [],
    losers: [
      page('https://example.com/average-teacher-salary-in-france/', -100),
      page('https://example.com/average-nurse-salary-in-germany/', -90),
      page('https://example.com/average-engineer-salary-in-italy/', -80),
      page('https://example.com/average-dentist-salary-in-spain/', -70),
      page('https://example.com/contact/', -5),
      page('https://example.com/privacy/', -5),
    ],
  })

  assert.equal(movement.length, 1)
  assert.equal(movement[0]?.signature, '/:slug')
  assert.equal(movement[0]?.direction, 'loser')
  assert.ok(movement[0]?.commonTerms.includes('average'))
  assert.ok(movement[0]?.commonTerms.includes('salary'))
  assert.match(movement[0]?.summary ?? '', /Common URL terms/)
})

function page(url: string, clickDelta: number): SegmentImpactItem {
  return {
    key: url,
    evidenceScope: 'matched-retained-segment',
    beforeClicks: clickDelta < 0 ? Math.abs(clickDelta) : 0,
    afterClicks: clickDelta > 0 ? clickDelta : 0,
    clickDelta,
    beforeImpressions: clickDelta < 0 ? Math.abs(clickDelta) * 10 : 0,
    afterImpressions: clickDelta > 0 ? clickDelta * 10 : 0,
    impressionDelta: clickDelta * 10,
    beforePosition: 5,
    afterPosition: 5,
    positionDelta: 0,
  }
}
