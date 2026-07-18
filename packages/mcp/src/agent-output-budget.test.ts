import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  AGENT_STRUCTURED_OUTPUT_MAX_BYTES,
  compactAgentWorkflowOutput,
} from './agent-output-budget.js'

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
