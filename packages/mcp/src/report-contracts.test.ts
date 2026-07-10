import assert from 'node:assert/strict'
import test from 'node:test'
import { getReportDefinition } from './report-registry.js'
import { runReport } from './reports.js'

function reportSchema(id: string) {
  const report = getReportDefinition(id)
  assert.ok(report, `Missing report definition: ${id}`)
  return report.inputSchema
}

test('calendar-month report inputs require a valid YYYY-MM value', () => {
  for (const id of ['monthly-report', 'workflow-monthly-report']) {
    const schema = reportSchema(id)
    assert.equal(
      schema.safeParse({ site: 'sc-domain:example.com', month: '2026-05' })
        .success,
      true,
      id,
    )
    for (const month of ['2026-5', '2026-00', '2026-13', 'May 2026']) {
      assert.equal(
        schema.safeParse({ site: 'sc-domain:example.com', month }).success,
        false,
        `${id}: ${month}`,
      )
    }
  }
})

test('calendar-date report inputs reject malformed and impossible dates', () => {
  const cases = [
    { id: 'ai-referrals', field: 'startDate', required: { property: '123' } },
    {
      id: 'community-intent',
      field: 'startDate',
      required: { site: 'sc-domain:example.com' },
    },
    {
      id: 'measure-change',
      field: 'changedAt',
      required: { site: 'sc-domain:example.com' },
    },
    {
      id: 'report-narrative',
      field: 'endDate',
      required: { site: 'sc-domain:example.com' },
    },
    {
      id: 'segment-impact',
      field: 'startDate',
      required: { site: 'sc-domain:example.com' },
    },
    {
      id: 'to-ai-query',
      field: 'endDate',
      required: { site: 'sc-domain:example.com' },
    },
  ] as const

  for (const { id, field, required } of cases) {
    const schema = reportSchema(id)
    assert.equal(
      schema.safeParse({ ...required, [field]: '2026-06-28' }).success,
      true,
      id,
    )
    for (const date of ['2026-6-28', '2026-02-30', '2026-13-01', 'yesterday']) {
      const allowsRelativeGa4Date =
        id === 'ai-referrals' && date === 'yesterday'
      assert.equal(
        schema.safeParse({ ...required, [field]: date }).success,
        allowsRelativeGa4Date,
        `${id}: ${date}`,
      )
    }
  }
})

test('technical-watch accepts active components and rejects a true no-op', async () => {
  const schema = reportSchema('workflow-technical-watch')
  for (const input of [
    { site: 'sc-domain:example.com' },
    {
      site: 'sc-domain:example.com',
      startUrl: 'https://example.com/',
      recoverLinks: false,
    },
    {
      site: 'sc-domain:example.com',
      urls: ['https://example.com/page'],
      recoverLinks: false,
    },
    {
      site: 'sc-domain:example.com',
      sitemaps: ['https://example.com/sitemap.xml'],
      recoverLinks: false,
    },
  ]) {
    assert.equal(schema.safeParse(input).success, true, JSON.stringify(input))
  }

  const noOp = { site: 'sc-domain:example.com', recoverLinks: false }
  assert.equal(schema.safeParse(noOp).success, false)

  const result = await runReport('workflow-technical-watch', noOp)
  assert.equal(result.isError, true)
  assert.deepEqual(result.structuredContent, {
    ok: false,
    error: {
      code: 'INVALID_INPUT',
      message:
        'Invalid parameters for workflow-technical-watch: recoverLinks: Pass startUrl, urls, sitemaps, or enable link recovery for technical-watch.',
      retryable: false,
    },
  })
})

test('technical-watch bounds nonblank strings, arrays, and counts', () => {
  const schema = reportSchema('workflow-technical-watch')
  const invalid = [
    { site: '' },
    { site: 'sc-domain:example.com', urls: [] },
    {
      site: 'sc-domain:example.com',
      urls: [
        'https://example.com/x',
        ...Array(100).fill('https://example.com/y'),
      ],
    },
    { site: 'sc-domain:example.com', sitemaps: [] },
    { site: 'sc-domain:example.com', properties: [''] },
    { site: 'sc-domain:example.com', limit: 0 },
    { site: 'sc-domain:example.com', limit: 1.5 },
    { site: 'sc-domain:example.com', dailyLimit: 2_001 },
    { site: 'sc-domain:example.com', inspectLimit: 101 },
    { site: 'sc-domain:example.com', maxUrls: 250_001 },
    { site: 'sc-domain:example.com', recoverDays: 549 },
    { site: 'sc-domain:example.com', recoverLimit: 101 },
    { site: 'sc-domain:example.com', recoverMinClicks: -1 },
    { site: 'sc-domain:example.com', recoverMinImpressions: 1.5 },
  ]

  for (const input of invalid) {
    assert.equal(schema.safeParse(input).success, false, JSON.stringify(input))
  }
})
