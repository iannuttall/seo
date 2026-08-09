export type TrafficHistoryDisplayRow = {
  month: string
  estimatedOrganicTraffic: number | null
  rankingResults: number | null
  estimatedTrafficValueUsd: number | null
  positions: {
    first: number | null
    secondToThird: number | null
    fourthToTenth: number | null
  }
  movement: {
    new: number | null
    up: number | null
    down: number | null
    lost: number | null
  }
}

export function sumKnownTrafficCounts(
  values: readonly (number | null)[],
): number | null {
  if (values.some((value) => value === null)) return null
  const sum = (values as readonly number[]).reduce(
    (total, value) => total + value,
    0,
  )
  return Number.isSafeInteger(sum) && sum >= 0 ? sum : null
}

function escapeCsv(value: string | number | null): string {
  const text = value === null ? 'N/A' : String(value)
  return /[",\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function buildTrafficHistoryCsv(
  history: readonly TrafficHistoryDisplayRow[],
): string {
  const rows: Array<Array<string | number | null>> = [
    [
      'year',
      'month',
      'estimated_organic_traffic',
      'ranking_keywords',
      'estimated_traffic_value_usd',
      'top_3',
      'top_10',
      'new',
      'up',
      'down',
      'lost',
    ],
  ]

  for (const row of history) {
    const [year, month] = row.month.split('-')
    const top3 = sumKnownTrafficCounts([
      row.positions.first,
      row.positions.secondToThird,
    ])
    const top10 = sumKnownTrafficCounts([top3, row.positions.fourthToTenth])
    rows.push([
      year ?? '',
      month ?? '',
      row.estimatedOrganicTraffic,
      row.rankingResults,
      row.estimatedTrafficValueUsd,
      top3,
      top10,
      row.movement.new,
      row.movement.up,
      row.movement.down,
      row.movement.lost,
    ])
  }

  return rows.map((row) => row.map(escapeCsv).join(',')).join('\n')
}
