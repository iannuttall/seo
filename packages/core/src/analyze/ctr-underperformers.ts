import { shouldExcludeBrandQuery } from '../brand.js'
import { querySearchAnalytics } from '../gsc/client.js'
import { isLowActionabilityQuery } from './query-quality.js'
import { CTR_BASELINE, defaultDateRange } from './shared.js'

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

  return {
    site: input.site,
    generatedAt: new Date().toISOString(),
    items,
  }
}
