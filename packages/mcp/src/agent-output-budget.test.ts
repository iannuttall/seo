import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withAgentReportContract } from '@seo/core'
import {
  AGENT_STRUCTURED_OUTPUT_MAX_BYTES,
  compactAgentWorkflowOutput,
} from './agent-output-budget.js'

test('workflow output preserves complete reports that fit the byte budget', () => {
  const report = {
    summary: 'Bounded keyword evidence.',
    rows: Array.from({ length: 25 }, (_, index) => ({
      keyword: `query ${index}`,
      volume: index * 10,
    })),
  }

  const output = compactAgentWorkflowOutput(report)
  const budget = output.outputBudget as {
    returnedBytes: number
    truncated: boolean
    omissions: unknown[]
  }
  assert.equal((output.rows as unknown[]).length, 25)
  assert.equal('findings' in output, false)
  assert.equal(budget.truncated, false)
  assert.deepEqual(budget.omissions, [])
  assert.equal(budget.returnedBytes, Buffer.byteLength(JSON.stringify(output)))
})

test('workflow output uses one total agent byte budget', () => {
  const report = {
    workflow: 'diagnose-property',
    site: 'sc-domain:example.com',
    generatedAt: '2026-07-18T00:00:00.000Z',
    summary: 'Large property report.',
    steps: [],
    actions: [],
    output: {
      narrative: {
        dataStatus: 'partial',
        caveats: ['Provider data is partial.'],
        warnings: ['Retained rows are capped.'],
        markdown: '# Duplicate display output',
        sections: Array.from({ length: 30 }, (_, section) => ({
          id: `section-${section}`,
          rows: Array.from({ length: 100 }, (_, row) => ({
            id: `${section}-${row}`,
            evidence: 'x'.repeat(1_000),
          })),
        })),
      },
    },
  }

  const compact = compactAgentWorkflowOutput(report)
  const budget = compact.outputBudget as {
    originalBytes: number
    returnedBytes: number
    truncated: boolean
    omissions: Array<{ path: string }>
  }

  assert.equal(Buffer.byteLength(JSON.stringify(compact)) <= 96 * 1024, true)
  assert.equal(budget.returnedBytes <= AGENT_STRUCTURED_OUTPUT_MAX_BYTES, true)
  assert.equal(budget.originalBytes > budget.returnedBytes, true)
  assert.equal(budget.truncated, true)
  assert.equal(
    budget.omissions.some((item) => item.path === 'output.narrative.markdown'),
    true,
  )
  assert.deepEqual(
    (compact.output as { narrative: { caveats: string[] } }).narrative.caveats,
    ['Provider data is partial.'],
  )
})

test('workflow output honours a smaller caller budget', () => {
  const maxBytes = 12 * 1024
  const report = {
    actions: Array.from({ length: 20 }, (_, index) => ({
      id: `finding-${index}`,
      title: `Finding ${index}`,
      action: 'Fix the returned finding and preserve its observed evidence.',
    })),
    detail: Array.from({ length: 100 }, (_, index) => ({
      index,
      evidence: 'x'.repeat(500),
    })),
  }

  const compact = compactAgentWorkflowOutput(report, { maxBytes })
  const budget = compact.outputBudget as {
    maxBytes: number
    returnedBytes: number
  }

  assert.equal(budget.maxBytes, maxBytes)
  assert.equal(budget.returnedBytes <= maxBytes, true)
  assert.equal(Buffer.byteLength(JSON.stringify(compact)) <= maxBytes, true)
})

test('workflow budget fallback retains provenance and caveats', () => {
  const report = {
    workflow: 'diagnose-property',
    site: 'sc-domain:example.com',
    summary: 'Fallback fixture.',
    provenance: { inputRows: 80_000, dataStatus: 'partial' },
    caveats: ['Provider rows were capped.'],
    output: Object.fromEntries(
      Array.from({ length: 500 }, (_, index) => [
        `section-${index}`,
        { evidence: 'x'.repeat(2_000) },
      ]),
    ),
  }

  const compact = compactAgentWorkflowOutput(report)

  assert.equal(Buffer.byteLength(JSON.stringify(compact)) <= 96 * 1024, true)
  assert.equal((compact.outputBudget as { fallback?: boolean }).fallback, true)
  assert.deepEqual(compact.retainedEvidence, {
    provenance: { inputRows: 80_000, dataStatus: 'partial' },
    caveats: ['Provider rows were capped.'],
  })
})

test('workflow budget never truncates complete findings', () => {
  const report = {
    workflow: 'site-crawl',
    actions: Array.from({ length: 56 }, (_, index) => ({
      id: `rule-${index}`,
      title: `Rule ${index}`,
      action: 'a'.repeat(2_000),
      confidence: 'high',
      verification: { expected: 'v'.repeat(1_000) },
    })),
    output: { rawEvidence: 'x'.repeat(200_000) },
  }

  assert.throws(
    () => compactAgentWorkflowOutput(withAgentReportContract(report)),
    /actionable rows were not truncated/u,
  )
})

test('workflow output preserves an existing report findings schema', () => {
  const report = {
    findings: [
      {
        code: 'repeated-domain',
        evidenceRef: 'domains.example',
        detail: 'One domain appeared twice.',
      },
    ],
  }

  const output = compactAgentWorkflowOutput(report)

  assert.deepEqual(output.findings, report.findings)
  assert.equal('reportFindings' in output, false)
})

test('workflow fallback keeps complete findings and inventory before report detail', () => {
  const maxBytes = 18 * 1024
  const report = {
    workflow: 'report',
    summary: 'A broad audit with a complete action queue.',
    issueGroupsComplete: true,
    actions: Array.from({ length: 16 }, (_, index) => ({
      id: `finding-${index}`,
      title: `Finding ${index}`,
      action: `Resolve finding ${index} using its observed evidence.`,
      verification: { expected: `Rerun check ${index}.` },
    })),
    searchConsoleExport: {
      pageInventory: {
        totalPages: 13,
        capped: false,
        rows: Array.from({ length: 13 }, (_, index) => ({
          path: `/page-${index}`,
          clicks: index,
          impressions: index * 100,
          suggestedDisposition: index % 2 ? 'keep' : 'review',
        })),
      },
    },
    output: Object.fromEntries(
      Array.from({ length: 100 }, (_, index) => [
        `section-${index}`,
        { rawEvidence: 'x'.repeat(4_000) },
      ]),
    ),
  }

  const compact = compactAgentWorkflowOutput(
    withAgentReportContract(report, { coverage: 'complete' }),
    { maxBytes },
  )
  const findings = compact.findings as {
    coverage: { state: string }
    counts: { total: number; returned: number }
    items: unknown[]
  }
  const inventory = (
    compact.inventories as Array<{
      complete: boolean
      totalItems: number
      returnedItems: number
      completion: { state: string }
      items: Array<{ id: string; decisionStatus: string }>
    }>
  )[0]

  assert.equal((compact.outputBudget as { fallback?: boolean }).fallback, true)
  assert.equal(findings.coverage.state, 'complete')
  assert.equal(findings.counts.total, 16)
  assert.equal(findings.counts.returned, 16)
  assert.equal(findings.items.length, 16)
  assert.equal(inventory?.complete, true)
  assert.equal(inventory?.totalItems, 13)
  assert.equal(inventory?.returnedItems, 13)
  assert.equal(inventory?.completion.state, 'pending')
  assert.equal(inventory?.items.length, 13)
  assert.match(inventory?.items[0]?.id ?? '', /^inventory-item-/)
  assert.equal(inventory?.items[0]?.decisionStatus, 'open')
  assert.equal(Buffer.byteLength(JSON.stringify(compact)) <= maxBytes, true)
})
