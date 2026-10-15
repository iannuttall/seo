import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAgentFindings, withAgentReportContract } from './agent-report.js'

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
