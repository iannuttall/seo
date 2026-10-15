import type { KeywordMetric, ProviderValue } from './contracts.js'
import type { ResearchImportColumns } from './imports/research-columns.js'

export type ResearchImportSource = {
  dataset: 'ranked-keywords'
  file: string
  provider: 'dataforseo' | 'ahrefs'
  exportedAt: string
  format?: 'csv' | 'json' | 'jsonl'
  rowLimit?: number
  columns?: ResearchImportColumns
}

export type RankedKeyword = KeywordMetric & {
  url: string
  rankGroup: number
  rankAbsolute: number
  resultType: string
  estimatedMonthlyTraffic: ProviderValue<number>
}
