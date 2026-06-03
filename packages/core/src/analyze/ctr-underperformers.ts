import { shouldExcludeBrandQuery } from '../brand.js'
import { querySearchAnalytics } from '../gsc/client.js'
import { isLowActionabilityQuery } from './query-quality.js'
import { CTR_BASELINE, defaultDateRange } from './shared.js'

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return count === 1 ? singular : pluralLabel
}

export async function ctrUnderperformersReport(input: {
  site: string
  minImpressions?: number
  brandTerms?: string[]
  includeBrand?: boolean
  refresh?: boolean
}) {
  const minImpressions = input.minImpressions ?? 200
  const range = defaultDateRange(28)
  const { rows } = await querySearchAnalytics(
    input.site,
    {
      ...range,
      dimensions: ['query', 'page'],
      type: 'web',
      dataState: 'final',
    },
    { refresh: input.refresh },
  )

  const items = rows
    .filter((row) => {
      const query = row.keys[0] ?? ''
      return (
        row.position >= 1 &&
        row.position <= 10 &&
        row.impressions >= minImpressions &&
        !isLowActionabilityQuery(query) &&
        !shouldExcludeBrandQuery({
          query,
          siteUrl: input.site,
          brandTerms: input.brandTerms,
          includeBrand: input.includeBrand,
        })
      )
    })
    .map((row) => {
      const rounded = Math.max(1, Math.min(10, Math.round(row.position)))
      const expected = CTR_BASELINE[rounded] ?? 0.01
      const expectedClicks = expected * row.impressions
      const clickShortfall = Math.max(0, expectedClicks - row.clicks)
      return {
        query: row.keys[0] ?? '',
        url: row.keys[1] ?? '',
        position: row.position,
        impressions: row.impressions,
        actualCtr: row.ctr,
        expectedCtr: expected,
        clicks: row.clicks,
        expectedClicks,
        clickShortfall,
        recommendation: {
          principle: 'C.3',
          evidenceRef: `Query "${row.keys[0]}" has CTR ${row.ctr.toFixed(3)} vs expected ${expected.toFixed(3)} at position ${rounded}, leaving about ${clickShortfall.toFixed(0)} clicks on the table.`,
          action: `This page ranks on page one for "${row.keys[0]}" but gets fewer clicks than expected. Rewrite the title and meta description to match the main search intent; do not rewrite the page body unless rankings also drop.`,
          effort: 'S' as const,
          confidence: 'medium' as const,
        },
      }
    })
    .filter((item) => item.actualCtr < item.expectedCtr * 0.6)
    .sort((a, b) => b.clickShortfall - a.clickShortfall)

  const totalClickShortfall = items.reduce(
    (sum, item) => sum + item.clickShortfall,
    0,
  )
  const top = items[0]

  return {
    site: input.site,
    range,
    generatedAt: new Date().toISOString(),
    summary: {
      underperformers: items.length,
      estimatedClickShortfall: totalClickShortfall,
      minImpressions,
      brandFiltering: input.includeBrand ? 'included' : 'excluded',
      verdict: top
        ? `${items.length} CTR ${plural(items.length, 'underperformer')} found, with about ${totalClickShortfall.toFixed(0)} estimated clicks available. Start with "${top.query}" because it has the largest click gap.`
        : 'No high-impression page-one queries are materially underperforming the expected CTR curve.',
    },
    items,
    caveats: [
      `Date window: ${range.startDate} to ${range.endDate} (28 days), using final GSC data where available.`,
      `Brand queries: ${input.includeBrand ? 'included' : 'excluded'}.`,
      `Only queries ranking position 1-10 with at least ${minImpressions} impressions were checked.`,
      'Expected CTR is a directional baseline by rounded ranking position, not a promise of available clicks.',
    ],
    recommendations: top
      ? [
          `Rewrite the title and meta description for "${top.query}" first. Keep the page body mostly stable unless rankings or content coverage are also weak.`,
          'Prioritise rows with high impressions, low actual CTR, and clear search intent. Avoid testing tiny queries where noise will hide the result.',
          'After changing SERP copy, annotate the change and compare the next full 28-day period before making more edits.',
        ]
      : [
          'No CTR-only action is recommended from this report. Use striking-distance or page-opportunities if you want more growth ideas.',
        ],
  }
}
