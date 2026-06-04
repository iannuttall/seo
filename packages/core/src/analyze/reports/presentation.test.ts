import assert from 'node:assert/strict'
import test from 'node:test'
import { reportPresentation } from './presentation.js'
import type { ReportNarrative } from './types.js'

test('reportPresentation exposes caveats, sections, and priorities as tables', () => {
  const presentation = reportPresentation({
    site: 'sc-domain:example.com',
    generatedAt: '2026-06-04T10:00:00.000Z',
    periodDays: 28,
    period: { startDate: '2026-05-01', endDate: '2026-05-28' },
    headline: 'Content opportunities found.',
    caveats: ['Brand queries excluded.'],
    sections: [
      {
        title: 'Content Opportunities',
        bullets: ['Improve pages with strong impressions and weak CTR.'],
      },
    ],
    priorities: [
      {
        title: 'Rewrite weak snippets',
        confidence: 'high',
        action: 'Start with pages that already rank and get impressions.',
      },
    ],
    diagnosis: {} as ReportNarrative['diagnosis'],
    changeMeasurements: [],
    monitoring: {} as ReportNarrative['monitoring'],
  })

  assert.deepEqual(
    presentation.tables.map((table) => table.id),
    ['report_caveats', 'report_sections', 'report_priorities'],
  )
  assert.equal(presentation.tables[2]?.rows[0]?.confidence, 'high')
})
