import { querySearchAnalytics } from '../../gsc/client.js'
import { defaultDateRange } from '../shared.js'
import { analyzeDecay } from './decay-analysis.js'

export async function decayingReport(input: {
  site: string
  windowCompare?: '28v28' | 'YoY'
  minDropPct?: number
  minPreviousClicks?: number
  minClickLoss?: number
  brandTerms?: string[]
  includeBrand?: boolean
  refresh?: boolean
}) {
  const currentRange = defaultDateRange(28)
  const previousEnd = new Date(`${currentRange.startDate}T00:00:00.000Z`)
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1)
  const previousStart = new Date(previousEnd)
  previousStart.setUTCDate(previousStart.getUTCDate() - 27)

  const [current, previous] = await Promise.all([
    querySearchAnalytics(
      input.site,
      {
        ...currentRange,
        dimensions: ['query', 'page'],
        type: 'web',
        dataState: 'final',
      },
      { refresh: input.refresh },
    ),
    querySearchAnalytics(
      input.site,
      {
        startDate: previousStart.toISOString().slice(0, 10),
        endDate: previousEnd.toISOString().slice(0, 10),
        dimensions: ['query', 'page'],
        type: 'web',
        dataState: 'final',
      },
      { refresh: input.refresh },
    ),
  ])

  const decay = analyzeDecay({
    site: input.site,
    currentRows: current.rows,
    previousRows: previous.rows,
    minDropPct: input.minDropPct,
    minPreviousClicks: input.minPreviousClicks,
    minClickLoss: input.minClickLoss,
    brandTerms: input.brandTerms,
    includeBrand: input.includeBrand,
  })

  return {
    site: input.site,
    generatedAt: new Date().toISOString(),
    filters: {
      minDropPct: input.minDropPct ?? 20,
      minPreviousClicks: input.minPreviousClicks ?? 2,
      minClickLoss: input.minClickLoss ?? 1,
      brand: input.includeBrand ? 'included' : 'excluded',
    },
    ...decay,
  }
}
