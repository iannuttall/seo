import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ReportNarrative } from '../analyze/reports/types.js'
import { renderReportHtml } from './report-html.js'

function fixture(overrides: Partial<ReportNarrative> = {}): ReportNarrative {
  return {
    site: 'https://example.com/',
    generatedAt: '2026-07-18T12:00:00.000Z',
    dataStatus: 'complete',
    periodDays: 28,
    period: { startDate: '2026-06-01', endDate: '2026-06-28' },
    headline: 'Clicks held steady while impressions increased.',
    caveats: ['Search Console data is final through the report end date.'],
    sections: [{ title: 'Performance', bullets: ['Clicks were unchanged.'] }],
    priorities: [
      {
        title: 'Review high-impression pages',
        confidence: 'high',
        action: 'Check snippets on the highest-impression pages.',
      },
    ],
    diagnosis: {
      skippedSections: [],
    } as unknown as ReportNarrative['diagnosis'],
    changeMeasurements: [],
    changeMeasurementAttempts: [],
    monitoring: {} as ReportNarrative['monitoring'],
    ...overrides,
  }
}

describe('renderReportHtml', () => {
  it('escapes report values and rejects unsafe site links', () => {
    const html = renderReportHtml({
      report: fixture({
        site: 'javascript:alert(1)',
        headline: '<img src=x onerror=alert(1)>',
        sections: [{ title: 'A & B', bullets: ['<script>alert(1)</script>'] }],
      }),
    })

    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/)
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
    assert.doesNotMatch(html, /href="javascript:/)
    assert.doesNotMatch(html, /<img src=x/)
  })
})
