import { querySearchAnalytics } from '../../gsc/client.js'
import { defaultDateRange } from '../shared.js'
import { analyzeDecay } from './decay-analysis.js'

function reportVerdict(input: {
  items: ReturnType<typeof analyzeDecay>['items']
  groups: ReturnType<typeof analyzeDecay>['groups']
}): string {
  if (!input.items.length) {
    return 'No material decay matched these filters.'
  }
  const topGroup = input.groups[0]
  if (topGroup) {
    return `${input.items.length} decaying query/page rows found. The biggest cluster is ${topGroup.label}, with ${topGroup.count} rows and ${topGroup.totalClickLoss.toFixed(0)} lost clicks.`
  }
  return `${input.items.length} decaying query/page rows found. Start with the highest lost-click rows.`
}

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
    ranges: {
      current: currentRange,
      previous: {
        startDate: previousStart.toISOString().slice(0, 10),
        endDate: previousEnd.toISOString().slice(0, 10),
      },
    },
    filters: {
      minDropPct: input.minDropPct ?? 20,
      minPreviousClicks: input.minPreviousClicks ?? 2,
      minClickLoss: input.minClickLoss ?? 1,
      brand: input.includeBrand ? 'included' : 'excluded',
    },
    summary: {
      rows: decay.items.length,
      groups: decay.groups.length,
      totalClickLoss: Number(
        decay.items.reduce((sum, item) => sum + item.clickLoss, 0).toFixed(2),
      ),
      brandFiltering: input.includeBrand ? 'included' : 'excluded',
      verdict: reportVerdict(decay),
    },
    caveats: [
      `Current window: ${currentRange.startDate} to ${currentRange.endDate}.`,
      `Previous window: ${previousStart.toISOString().slice(0, 10)} to ${previousEnd.toISOString().slice(0, 10)}.`,
      `Filters: at least ${input.minPreviousClicks ?? 2} previous clicks, ${input.minClickLoss ?? 1} ${input.minClickLoss === 1 || input.minClickLoss === undefined ? 'lost click' : 'lost clicks'}, and ${(input.minDropPct ?? 20).toFixed(0)}% drop.`,
      `Brand filtering: ${input.includeBrand ? 'brand queries included' : 'brand queries excluded when detected/configured'}.`,
      'Decay cause is inferred from GSC query/page movement: lost visibility, lost position, lost CTR, or lost impressions.',
    ],
    recommendations: decay.groups.length
      ? decay.groups.slice(0, 5).map((group) => group.recommendation)
      : [
          'No decay action is recommended from this report. Lower --min-previous-clicks or --min-click-loss if you want long-tail inspection.',
        ],
    ...decay,
  }
}
