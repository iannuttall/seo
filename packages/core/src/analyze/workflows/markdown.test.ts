import assert from 'node:assert/strict'
import test from 'node:test'
import { renderWorkflowMarkdown } from './markdown.js'
import { workflowPresentation } from './presentation.js'
import type { PriorityQueueItem, WorkflowReport } from './types.js'

test('renderWorkflowMarkdown renders actions and priority queue tables', () => {
  const report: WorkflowReport<{ queue: PriorityQueueItem[] }> = {
    workflow: 'refresh-priorities',
    site: 'sc-domain:example.com',
    generatedAt: '2026-06-04T10:00:00.000Z',
    summary: '1 ranked SEO priority refreshed.',
    steps: [
      {
        tool: 'seo_diagnose_property',
        status: 'completed',
        summary: 'Combined diagnosis and opportunity signals.',
      },
    ],
    actions: [
      {
        title: 'Improve title | snippet',
        action: 'Rewrite the title and meta description around intent.',
        confidence: 'high',
      },
    ],
    output: {
      queue: [
        {
          source: 'quick-win',
          title: 'example query',
          target: 'https://example.com/page',
          category: 'content',
          score: 88.25,
          impact: 12,
          confidence: 'high',
          action: 'Add the missing entity coverage and improve snippets.',
          evidence: 'Ranking page has impressions and weak CTR.',
          scoreBreakdown: {
            impact: 20,
            source: 20,
            confidence: 20,
            effort: 10,
            verification: 10,
            template: 5,
            analytics: 5,
            final: 88.25,
          },
        },
      ],
    },
  }

  const markdown = renderWorkflowMarkdown(report)

  assert.match(markdown, /^# refresh-priorities/)
  assert.match(markdown, /Property: sc-domain:example\.com/)
  assert.match(markdown, /## Steps/)
  assert.match(markdown, /## Recommended Actions/)
  assert.match(markdown, /Improve title \\\| snippet/)
  assert.match(markdown, /## Priority Queue/)
  assert.match(markdown, /\| 1 \| quick-win \| content \| 88\.3 \| high /)

  const presentation = workflowPresentation(report)
  assert.deepEqual(
    presentation.tables.map((table) => table.id),
    ['steps', 'recommended_actions', 'priority_queue'],
  )
  assert.equal(presentation.tables[2]?.rows[0]?.score, 88.3)
  assert.deepEqual(presentation.charts, [
    {
      id: 'priority_scores',
      title: 'Priority Scores',
      type: 'bar',
      tableId: 'priority_queue',
      xKey: 'rank',
      yKey: 'score',
    },
  ])
})
