import type { Presentation, PresentationChart } from '../../presentation.js'
import type { PseoAuditReport } from './audit.js'

function inspectionLabel(template: PseoAuditReport['templates'][number]) {
  const total =
    template.inspection.indexed +
    template.inspection.notIndexed +
    template.inspection.warnings
  if (!total) return 'not checked'
  return `${template.inspection.indexed}/${total} indexed`
}

function crawlLabel(template: PseoAuditReport['templates'][number]) {
  const samples = template.crawl.samples.length
  if (!samples) return 'not crawled'
  return `${template.crawl.blockedOrFailed}/${samples} blocked/failed`
}

export function pseoPresentation(report: PseoAuditReport): Presentation {
  const charts: PresentationChart[] = report.templates.length
    ? [
        {
          id: 'template_impressions',
          title: 'Template Impressions',
          type: 'bar',
          tableId: 'pseo_templates',
          xKey: 'rank',
          yKey: 'impressions',
        },
        {
          id: 'template_clicks',
          title: 'Template Clicks',
          type: 'bar',
          tableId: 'pseo_templates',
          xKey: 'rank',
          yKey: 'clicks',
        },
      ]
    : []

  return {
    tables: [
      {
        id: 'pseo_summary',
        title: 'pSEO Summary',
        columns: [
          { key: 'metric', label: 'Metric' },
          { key: 'value', label: 'Value', type: 'number' },
        ],
        rows: [
          { metric: 'templates', value: report.summary.templates },
          { metric: 'gsc_pages', value: report.summary.gscPages },
          { metric: 'sitemap_urls', value: report.summary.sitemapUrls },
          { metric: 'clicks', value: report.summary.clicks },
          { metric: 'impressions', value: report.summary.impressions },
          { metric: 'crawled_urls', value: report.summary.crawledUrls },
          { metric: 'inspected_urls', value: report.summary.inspectedUrls },
        ],
      },
      {
        id: 'pseo_templates',
        title: 'pSEO Templates',
        columns: [
          { key: 'rank', label: 'Rank', type: 'number' },
          { key: 'template', label: 'Template' },
          { key: 'verdict', label: 'Verdict' },
          { key: 'confidence', label: 'Confidence' },
          { key: 'urls', label: 'URLs', type: 'number' },
          { key: 'clicks', label: 'Clicks', type: 'number' },
          { key: 'impressions', label: 'Impressions', type: 'number' },
          { key: 'ctr', label: 'CTR', type: 'number' },
          { key: 'position', label: 'Position', type: 'number' },
          { key: 'index', label: 'Index' },
          { key: 'crawl', label: 'Crawl' },
          { key: 'recommendation', label: 'Recommendation' },
        ],
        rows: report.templates.map((template, index) => ({
          rank: index + 1,
          template: template.signature,
          verdict: template.verdict,
          confidence: template.confidence,
          urls: template.urlCount,
          clicks: template.metrics.clicks,
          impressions: template.metrics.impressions,
          ctr: Number(template.metrics.ctr.toFixed(3)),
          position: Number(template.metrics.position.toFixed(1)),
          index: inspectionLabel(template),
          crawl: crawlLabel(template),
          recommendation: template.recommendation,
        })),
      },
    ],
    charts,
  }
}
