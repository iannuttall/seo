import type {
  BingCrawlRow,
  BingDimensionRow,
  BingTrafficRow,
} from './client.js'

const DAY_MS = 86_400_000
const DEFAULT_COMPARISON_DAYS = 28
const WEEKLY_PERIODS = 4
const OPPORTUNITY_MIN_IMPRESSIONS = 20
const OPPORTUNITY_MIN_POSITION = 4
const OPPORTUNITY_MAX_POSITION = 20
const RESULT_LIMIT = 10

function dateOffset(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10)
}

function percentChange(previous: number, current: number) {
  if (previous === 0) return null
  return round(((current - previous) / previous) * 100)
}

function round(value: number, digits = 3) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function trafficPeriod(
  byDate: Map<string, { clicks: number; impressions: number }>,
  startDate: string,
  endDate: string,
  expectedDays: number,
) {
  let clicks = 0
  let impressions = 0
  let observedDays = 0
  for (const [date, row] of byDate) {
    if (date < startDate || date > endDate) continue
    observedDays += 1
    clicks += row.clicks
    impressions += row.impressions
  }
  return {
    startDate,
    endDate,
    expectedDays,
    observedDays,
    missingDays: Math.max(0, expectedDays - observedDays),
    clicks,
    impressions,
    ctr: impressions ? round((clicks / impressions) * 100) : null,
  }
}

export function analyzeBingTraffic(
  rows: BingTrafficRow[],
  comparisonDays = DEFAULT_COMPARISON_DAYS,
) {
  if (!rows.length) return undefined
  const byDate = new Map<string, { clicks: number; impressions: number }>()
  for (const row of rows) {
    const existing = byDate.get(row.date) ?? { clicks: 0, impressions: 0 }
    existing.clicks += row.clicks
    existing.impressions += row.impressions
    byDate.set(row.date, existing)
  }
  const latestDate = [...byDate.keys()].sort().at(-1)
  if (!latestDate) return undefined
  const currentStart = dateOffset(latestDate, -(comparisonDays - 1))
  const previousEnd = dateOffset(currentStart, -1)
  const previousStart = dateOffset(previousEnd, -(comparisonDays - 1))
  const current = trafficPeriod(
    byDate,
    currentStart,
    latestDate,
    comparisonDays,
  )
  const previous = trafficPeriod(
    byDate,
    previousStart,
    previousEnd,
    comparisonDays,
  )
  return {
    comparisonDays,
    current,
    previous,
    changes: {
      clicks: current.clicks - previous.clicks,
      clicksPercent: percentChange(previous.clicks, current.clicks),
      impressions: current.impressions - previous.impressions,
      impressionsPercent: percentChange(
        previous.impressions,
        current.impressions,
      ),
      ctrPercentagePoints:
        current.ctr === null || previous.ctr === null
          ? null
          : round(current.ctr - previous.ctr),
    },
  }
}

const CRAWL_FIELDS = [
  'crawledPages',
  'inIndex',
  'inLinks',
  'crawlErrors',
  'code4xx',
  'code5xx',
  'blockedByRobotsTxt',
  'connectionTimeout',
  'dnsFailures',
  'containsMalware',
] as const satisfies ReadonlyArray<keyof BingCrawlRow>

export function analyzeBingCrawl(
  rows: BingCrawlRow[],
  comparisonDays = DEFAULT_COMPARISON_DAYS,
) {
  const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date, 'en'))
  const current = ordered.at(-1)
  if (!current) return undefined
  const targetDate = dateOffset(current.date, -comparisonDays)
  const previous = ordered.filter((row) => row.date <= targetDate).at(-1)
  const changes: Partial<
    Record<
      (typeof CRAWL_FIELDS)[number],
      {
        previous: number
        current: number
        absolute: number
        percent: number | null
      }
    >
  > = {}
  if (!previous) {
    return {
      comparisonDays,
      targetDate,
      current,
      previous: undefined,
      changes,
    }
  }
  for (const field of CRAWL_FIELDS) {
    const currentValue = current[field]
    const previousValue = previous[field]
    if (typeof currentValue !== 'number' || typeof previousValue !== 'number') {
      continue
    }
    changes[field] = {
      previous: previousValue,
      current: currentValue,
      absolute: currentValue - previousValue,
      percent: percentChange(previousValue, currentValue),
    }
  }
  return { comparisonDays, targetDate, current, previous, changes }
}

type Aggregate = {
  value: string
  observedWeeks: number
  clicks: number
  impressions: number
  avgClickPosition: number | null
  avgImpressionPosition: number | null
}

function aggregateDimensions(rows: BingDimensionRow[], dates: Set<string>) {
  const values = new Map<
    string,
    {
      clicks: number
      impressions: number
      clickPositionTotal: number
      clickPositionWeight: number
      impressionPositionTotal: number
      impressionPositionWeight: number
      observedDates: Set<string>
    }
  >()
  for (const row of rows) {
    if (!dates.has(row.date)) continue
    const item = values.get(row.value) ?? {
      clicks: 0,
      impressions: 0,
      clickPositionTotal: 0,
      clickPositionWeight: 0,
      impressionPositionTotal: 0,
      impressionPositionWeight: 0,
      observedDates: new Set<string>(),
    }
    item.clicks += row.clicks
    item.impressions += row.impressions
    item.observedDates.add(row.date)
    if (row.avgClickPosition !== undefined && row.clicks > 0) {
      const weight = row.clicks
      item.clickPositionTotal += row.avgClickPosition * weight
      item.clickPositionWeight += weight
    }
    if (row.avgImpressionPosition !== undefined && row.impressions > 0) {
      const weight = row.impressions
      item.impressionPositionTotal += row.avgImpressionPosition * weight
      item.impressionPositionWeight += weight
    }
    values.set(row.value, item)
  }
  return new Map<string, Aggregate>(
    [...values].map(([value, item]) => [
      value,
      {
        value,
        observedWeeks: item.observedDates.size,
        clicks: item.clicks,
        impressions: item.impressions,
        avgClickPosition: item.clickPositionWeight
          ? round(item.clickPositionTotal / item.clickPositionWeight)
          : null,
        avgImpressionPosition: item.impressionPositionWeight
          ? round(item.impressionPositionTotal / item.impressionPositionWeight)
          : null,
      },
    ]),
  )
}

function compareValue(a: { value: string }, b: { value: string }) {
  return a.value.localeCompare(b.value, 'en')
}

export function analyzeBingDimensions(
  rows: BingDimensionRow[],
  kind: 'query' | 'page',
) {
  const dates = [...new Set(rows.map((row) => row.date))].sort().reverse()
  const currentDates = dates.slice(0, WEEKLY_PERIODS)
  const previousDates = dates.slice(WEEKLY_PERIODS, WEEKLY_PERIODS * 2)
  const current = aggregateDimensions(rows, new Set(currentDates))
  const previous = aggregateDimensions(rows, new Set(previousDates))
  const matchedValues = [...current.keys()].filter((value) =>
    previous.has(value),
  )
  const comparisonReady =
    currentDates.length === WEEKLY_PERIODS &&
    previousDates.length === WEEKLY_PERIODS
  const comparableValues = comparisonReady
    ? matchedValues.filter((value) => {
        const currentValue = current.get(value)
        const previousValue = previous.get(value)
        return (
          currentValue?.observedWeeks === WEEKLY_PERIODS &&
          previousValue?.observedWeeks === WEEKLY_PERIODS
        )
      })
    : []
  const movements = comparableValues
    .map((value) => {
      const currentValue = current.get(value) as Aggregate
      const previousValue = previous.get(value) as Aggregate
      return {
        value,
        current: currentValue,
        previous: previousValue,
        changes: {
          clicks: currentValue.clicks - previousValue.clicks,
          clicksPercent: percentChange(
            previousValue.clicks,
            currentValue.clicks,
          ),
          impressions: currentValue.impressions - previousValue.impressions,
          impressionsPercent: percentChange(
            previousValue.impressions,
            currentValue.impressions,
          ),
        },
      }
    })
    .sort(
      (a, b) =>
        Math.abs(b.changes.clicks) - Math.abs(a.changes.clicks) ||
        Math.abs(b.changes.impressions) - Math.abs(a.changes.impressions) ||
        compareValue(a, b),
    )
    .slice(0, RESULT_LIMIT)
  const opportunities = [...current.values()]
    .filter(
      (row) =>
        row.impressions >= OPPORTUNITY_MIN_IMPRESSIONS &&
        row.avgImpressionPosition !== null &&
        row.avgImpressionPosition >= OPPORTUNITY_MIN_POSITION &&
        row.avgImpressionPosition <= OPPORTUNITY_MAX_POSITION,
    )
    .sort(
      (a, b) =>
        b.impressions - a.impressions ||
        b.clicks - a.clicks ||
        compareValue(a, b),
    )
    .slice(0, RESULT_LIMIT)

  return {
    kind,
    sourceSemantics:
      'Bing weekly top-list evidence. Missing dimensions are unknown, not zero. Movements require observation in every week of both periods.',
    periods: {
      weeksPerPeriod: WEEKLY_PERIODS,
      currentDates,
      previousDates,
    },
    coverage: {
      sourceRows: rows.length,
      currentDimensions: current.size,
      previousDimensions: previous.size,
      matchedDimensions: matchedValues.length,
      comparableDimensions: comparableValues.length,
      incompleteMatchedDimensions:
        matchedValues.length - comparableValues.length,
      currentOnlyDimensions: [...current.keys()].filter(
        (value) => !previous.has(value),
      ).length,
      previousOnlyDimensions: [...previous.keys()].filter(
        (value) => !current.has(value),
      ).length,
    },
    thresholds: {
      heuristic: true as const,
      opportunityMinImpressions: OPPORTUNITY_MIN_IMPRESSIONS,
      opportunityPositionRange: [
        OPPORTUNITY_MIN_POSITION,
        OPPORTUNITY_MAX_POSITION,
      ] as const,
      resultLimit: RESULT_LIMIT,
    },
    movements,
    opportunities,
  }
}

export const bingAnalysisDefaults = {
  comparisonDays: DEFAULT_COMPARISON_DAYS,
  weeklyPeriods: WEEKLY_PERIODS,
  resultLimit: RESULT_LIMIT,
} as const
