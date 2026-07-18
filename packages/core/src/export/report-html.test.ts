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
  it('renders a self-contained client report from the narrative DTO', () => {
    const html = renderReportHtml({ report: fixture() })

    assert.match(html, /<!doctype html>/)
    assert.match(html, /Clicks held steady while impressions increased\./)
    assert.match(html, /Review high-impression pages/)
    assert.doesNotMatch(html, /<script/)
    assert.doesNotMatch(html, /https?:\/\/[^"<]*\.(?:css|js|woff2?)/)
  })

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

  it('shows partial evidence notes and analyst coverage', () => {
    const html = renderReportHtml({
      report: fixture({
        dataStatus: 'partial',
        diagnosis: {
          skippedSections: [
            { section: 'traffic anomaly', reason: 'Not enough daily rows.' },
          ],
        } as unknown as ReportNarrative['diagnosis'],
      }),
      view: 'analyst',
      additionalSections: [
        {
          title: 'Technical evidence',
          summary: 'A saved crawl was used.',
          items: ['SEO-001 affected 3 URLs.'],
        },
      ],
    })

    assert.match(html, /<details open>/)
    assert.match(html, /Evidence coverage/)
    assert.match(html, /traffic anomaly: Not enough daily rows\./)
    assert.match(html, /Technical evidence/)
  })
})
