import assert from 'node:assert/strict'
import test from 'node:test'
import {
  agentActionsView,
  buildAgentFindings,
  withAgentReportContract,
} from './agent-report.js'

test('agent findings deduplicate known actionable shapes with stable ids', () => {
  const report = {
    actions: [
      {
        id: 'missing-title',
        title: 'Add the missing title',
        action: 'Write a descriptive title.',
        confidence: 'high',
      },
    ],
    technicalCrawl: {
      issueGroupsComplete: true,
      topFixes: [
        {
          ruleId: 'missing-title',
          title: 'Add the missing title',
          howToFix: 'Write a descriptive title.',
          howToVerify: 'The page has one non-empty title.',
          verification: {
            command: 'seo crawl https://example.com --severity high',
            expected: 'The page has one non-empty title.',
          },
          severity: 'high',
          count: 2,
          sampleUrls: ['https://example.com/a', 'https://example.com/b'],
          evidence: {
            ruleId: 'missing-title',
            source: 'crawl',
            whyThisRanks: 'A title is an observed page signal.',
          },
        },
      ],
    },
  }

  const first = buildAgentFindings(report, { coverage: 'complete' })
  const second = buildAgentFindings(report, { coverage: 'complete' })

  assert.deepEqual(first, second)
  assert.equal(first.findings.counts.total, 1)
  assert.equal(first.findings.items[0]?.id, 'missing-title')
  assert.equal(first.findings.items[0]?.affectedCount, 2)
  assert.deepEqual(first.findings.items[0]?.affectedUrls, {
    total: 2,
    returned: 2,
    complete: true,
    items: ['https://example.com/a', 'https://example.com/b'],
  })
  assert.equal(first.findings.items[0]?.type, 'fix')
  assert.deepEqual(first.findings.items[0]?.allowedOutcomes, [
    'fixed',
    'deferred',
    'not-needed',
  ])
  assert.deepEqual(first.findings.items[0]?.evidence, {
    ruleId: 'missing-title',
    source: 'crawl',
    whyThisRanks: 'A title is an observed page signal.',
    count: 2,
    sampleUrls: ['https://example.com/a', 'https://example.com/b'],
  })
  assert.equal(
    first.findings.items[0]?.verification?.command,
    'seo crawl https://example.com --severity high',
  )
  assert.equal(first.findings.completion.state, 'pending')
  assert.equal(first.findings.coverage.state, 'complete')
})

test('agent actions view retains the complete migration inventory near the top', () => {
  const rows = [
    { path: '/keep', suggestedDisposition: 'keep' },
    { path: '/update', suggestedDisposition: 'update' },
  ]
  const report = {
    workflow: 'report',
    site: 'https://example.com',
    generatedAt: '2026-08-11T00:00:00.000Z',
    summary: 'Two pages need decisions.',
    actions: [
      {
        title: 'Review the content inventory',
        action: 'Decide each page separately.',
        confidence: 'medium',
      },
    ],
    searchConsoleExport: {
      pageInventory: {
        rows,
        totalPages: 2,
        capped: false,
        page: 1,
        pageCount: 1,
        nextPage: null,
        criteria: ['keep: has clicks', 'update: weak position'],
        note: 'Owner intent decides the final disposition.',
      },
    },
    output: { rawRows: Array.from({ length: 100 }, (_, index) => index) },
  }

  const view = agentActionsView(report, { reportId: 'report' })
  assert.equal(view.view, 'actions')
  assert.deepEqual(view.report, {
    id: 'report',
    workflow: 'report',
    site: 'https://example.com',
    generatedAt: '2026-08-11T00:00:00.000Z',
    summary: 'Two pages need decisions.',
  })
  const inventory = (
    view.inventories as Array<{
      completion: { state: string; instruction: string }
      pagination: { page: number; pageCount: number; nextPage: number | null }
      items: Array<{
        id: string
        decisionStatus: string
        path: string
        suggestedDisposition: string
      }>
    }>
  )[0]
  assert.equal(inventory?.completion.state, 'pending')
  assert.deepEqual(inventory?.pagination, {
    page: 1,
    pageCount: 1,
    nextPage: null,
  })
  assert.match(inventory?.completion.instruction ?? '', /every returned row/)
  assert.deepEqual(
    inventory?.items.map(({ path, suggestedDisposition, decisionStatus }) => ({
      path,
      suggestedDisposition,
      decisionStatus,
    })),
    rows.map((row) => ({ ...row, decisionStatus: 'open' })),
  )
  assert.equal(
    inventory?.items.every((item) => item.id.startsWith('inventory-item-')),
    true,
  )
  assert.equal('output' in view, false)
})

test('agent report contract does not invent findings for evidence-only reports', () => {
  const report = withAgentReportContract({
    summary: { verdict: 'No retained rows.' },
    evidence: { rows: [] },
    recommendations: [{ recommendation: 'review' }],
  })
  const findings = report.findings as {
    counts: { total: number }
    completion: { state: string }
    coverage: { state: string }
  }
  assert.equal(findings.counts.total, 0)
  assert.equal(findings.completion.state, 'not-required')
  assert.equal(findings.coverage.state, 'unknown')
})

test('agent report contract normalizes an existing top-level findings array', () => {
  const report = withAgentReportContract({
    findings: [
      {
        id: 'existing-finding',
        title: 'Existing finding',
        action: 'Fix the retained finding.',
      },
    ],
  })
  const findings = report.findings as {
    counts: { total: number }
    items: Array<{ id: string }>
  }

  assert.equal(findings.counts.total, 1)
  assert.equal(findings.items[0]?.id, 'existing-finding')
  assert.deepEqual(report.reportFindings, [
    {
      id: 'existing-finding',
      title: 'Existing finding',
      action: 'Fix the retained finding.',
    },
  ])
})

test('agent report contract preserves evidence-only report findings', () => {
  const report = withAgentReportContract({
    findings: [
      {
        code: 'repeated-domain',
        evidenceRef: 'domains.example',
        principle: 'Repeated domains are observations.',
        detail: 'One domain appeared twice.',
      },
    ],
  })
  const findings = report.findings as { counts: { total: number } }

  assert.equal(findings.counts.total, 0)
  assert.deepEqual(report.reportFindings, [
    {
      code: 'repeated-domain',
      evidenceRef: 'domains.example',
      principle: 'Repeated domains are observations.',
      detail: 'One domain appeared twice.',
    },
  ])
})

test('agent findings can treat an explicitly complete root action queue as authoritative', () => {
  const result = buildAgentFindings(
    {
      actions: [
        { id: 'crawl:title', title: 'Fix title', action: 'Add a title.' },
        {
          id: 'unreached:title',
          title: 'Fix title on unreached pages',
          action: 'Add a title.',
        },
      ],
      technicalCrawl: {
        topFixes: [
          { ruleId: 'title', title: 'Fix title', howToFix: 'Add a title.' },
        ],
      },
      searchConsoleExport: {
        unreachedPagesAudit: {
          topFixes: [
            { ruleId: 'title', title: 'Fix title', howToFix: 'Add a title.' },
          ],
        },
      },
    },
    { preferRootActions: true, coverage: 'complete' },
  )

  assert.equal(result.findings.counts.total, 2)
  assert.deepEqual(
    result.findings.items.map((item) => item.id),
    ['crawl:title', 'unreached:title'],
  )
  assert.deepEqual(result.findings.sourcePaths, ['actions'])
})

test('agent findings retain every item returned by the originating report', () => {
  const result = buildAgentFindings({
    actions: Array.from({ length: 300 }, (_, index) => ({
      id: `action-${index}`,
      title: `Action ${index}`,
      action: `Fix ${index}`,
    })),
  })

  assert.equal(result.findings.counts.total, 300)
  assert.equal(result.findings.counts.returned, 300)
  assert.equal(result.findings.coverage.state, 'unknown')
})

test('nested completeness flags do not overstate whole-report coverage', () => {
  const result = buildAgentFindings({
    section: {
      issueGroupsComplete: true,
      actions: [{ id: 'one', title: 'One', action: 'Do one thing.' }],
    },
    otherEvidence: { capped: true },
  })

  assert.equal(result.findings.coverage.state, 'unknown')
})

test('review findings expose deterministic change conditions instead of a fix', () => {
  const result = buildAgentFindings({
    actions: [
      {
        id: 'crawl:structured_data_missing',
        kind: 'review',
        title: 'structured_data_missing: No structured data detected (3 URLs)',
        action:
          'Add structured data only where a schema type genuinely describes the page.',
        affectedCount: 3,
        sampleUrls: [
          'https://example.com/blog',
          'https://example.com/features',
          'https://example.com/pricing',
        ],
        affectedUrlsReport: {
          id: 'affected-urls',
          params: {
            reportId: 'crawl-report-1',
            ruleId: 'structured_data_missing',
          },
        },
        evidence: {
          ruleId: 'structured_data_missing',
          source: 'crawl',
        },
      },
    ],
  })
  const finding = result.findings.items[0]

  assert.equal(finding?.type, 'review')
  assert.equal('fix' in (finding ?? {}), false)
  assert.deepEqual(finding?.allowedOutcomes, [
    'changed',
    'no-change',
    'deferred',
  ])
  assert.match(
    finding?.type === 'review' ? finding.review.changeOnlyIf : '',
    /specific schema type fits the page/u,
  )
  assert.match(
    finding?.type === 'review' ? finding.review.doNot.join(' ') : '',
    /Do not add Organization/u,
  )
  assert.deepEqual(finding?.affectedUrls, {
    total: 3,
    returned: 3,
    complete: true,
    items: [
      'https://example.com/blog',
      'https://example.com/features',
      'https://example.com/pricing',
    ],
    report: {
      id: 'affected-urls',
      params: {
        reportId: 'crawl-report-1',
        ruleId: 'structured_data_missing',
      },
    },
  })
})
