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
    attribution: 'not-established',
    confidence: 'none',
    classification: 'no-update-overlap',
    summary: 'No update overlap evidence.',
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

function segmentCoverage(input: {
  eligibleRows: number
  returnedRows?: number
  limitedRows?: number
  resultLimit?: number
  sourcePossiblyTruncated?: boolean
}) {
  const returnedRows = input.returnedRows ?? input.eligibleRows
  return {
    evidenceScope: 'matched-retained-segments' as const,
    eligibleRows: input.eligibleRows,
    returnedRows,
    limitedRows:
      input.limitedRows ?? Math.max(0, input.eligibleRows - returnedRows),
    resultLimit: input.resultLimit ?? Math.max(1, returnedRows),
    sourceRowLimit: 100_000,
    movedRows: returnedRows,
    unchangedRows: 0,
    sourcePossiblyTruncated: input.sourcePossiblyTruncated ?? false,
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
    coverage: segmentCoverage({ eligibleRows: 6 }),
  })

  assert.equal(movement.length, 1)
  assert.equal(movement[0]?.signature, '/cities/:value')
  assert.equal(movement[0]?.direction, 'winner')
  assert.equal(movement[0]?.urlCount, 4)
  assert.equal(
    movement[0]?.movementShareScope,
    'returned-directional-page-click-movement',
  )
  assert.match(movement[0]?.summary ?? '', /gained 360 clicks/)
})

test('postmortem scopes capped template shares to returned retained rows', async () => {
  const urls = Array.from(
    { length: 25 },
    (_, index) => `https://example.com/cities/city-${index + 1}/`,
  )
  const beforeRows = urls.map((url) => pageRow(url, 1))
  const afterRows = urls.map((url, index) => pageRow(url, 101 - index))

  const report = await updatePostmortemWorkflow(
    { site: 'sc-domain:example.com', limit: 20 },
    {
      updateCorrelation: async () => updateFixture(),
      segmentImpact: async (input) =>
        compareSegmentRows({
          site: input.site,
          dimension: input.dimension ?? 'page',
          before: { startDate: '2026-04-01', endDate: '2026-04-28' },
          after: { startDate: '2026-04-29', endDate: '2026-05-26' },
          beforeRows,
          afterRows,
          limit: input.limit,
        }),
    },
  )

  const pageSegment = report.output.segments.page
  assert.deepEqual(pageSegment.coverage, {
    evidenceScope: 'matched-retained-segments',
    eligibleRows: 25,
    returnedRows: 20,
    limitedRows: 5,
    resultLimit: 20,
    sourceRowLimit: 100_000,
    movedRows: 20,
    unchangedRows: 0,
    sourcePossiblyTruncated: false,
  })
  assert.equal(pageSegment.winners.length, 20)

  const template = report.output.templateMovement[0]
  assert.equal(template?.movementShare, 1)
  assert.equal(
    template?.movementShareScope,
    'returned-directional-page-click-movement',
  )
  assert.equal(template?.confidence, 'medium')
  assert.equal(
    template?.confidenceScope,
    'pattern-within-returned-matched-retained-page-segments',
  )
  assert.match(template?.summary ?? '', /100% of returned winner page/)
  assert.match(template?.summary ?? '', /20 of 25 eligible/)
  assert.match(report.output.insights[0]?.summary ?? '', /result limit 20/)

  const csv = updatePostmortemCsvFiles(report)
  const summary = csv.find((file) => file.filename === 'postmortem-summary.csv')
  const templates = csv.find(
    (file) => file.filename === 'postmortem-template-movement.csv',
  )
  assert.equal(summary?.rows[0]?.page_segment_eligible_rows, 25)
  assert.equal(summary?.rows[0]?.page_segment_returned_rows, 20)
  assert.equal(summary?.rows[0]?.page_segment_limited_rows, 5)
  assert.equal(summary?.rows[0]?.page_segment_result_limit, 20)
  assert.equal(
    templates?.rows[0]?.movement_share_scope,
    'returned-directional-page-click-movement',
  )
  assert.equal(templates?.rows[0]?.eligible_rows, 25)
  assert.equal(templates?.rows[0]?.returned_rows, 20)
})

test('source-capped retained rows cannot receive high pattern confidence', () => {
  const winners = Array.from({ length: 10 }, (_, index) =>
    page(`https://example.com/cities/city-${index + 1}/`, 100 - index),
  )
  const movement = inferTemplateMovement({
    winners,
    losers: [],
    coverage: segmentCoverage({
      eligibleRows: 10,
      sourcePossiblyTruncated: true,
    }),
  })

  assert.equal(movement[0]?.confidence, 'medium')
  assert.equal(movement[0]?.segmentCoverage.sourcePossiblyTruncated, true)
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
