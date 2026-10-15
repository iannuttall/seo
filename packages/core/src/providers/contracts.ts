import { z } from 'zod'
import type { ResearchImportColumns } from './imports/research-columns.js'

export const providerIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
export type ProviderId = z.infer<typeof providerIdSchema>
export type ExternalServiceId = string

export const providerCapabilitySchema = z.enum([
  'keyword-metrics',
  'keyword-discovery',
  'serp-snapshot',
  'domain-overview',
  'ranked-keywords',
  'relevant-pages',
  'serp-competitors',
  'link-summary',
  'referring-domains',
  'backlinks',
  'domain-rating',
  'local-search',
  'ai-mentions',
  'ai-prompt-observation',
])
export type ProviderCapability = z.infer<typeof providerCapabilitySchema>

export type ProviderValue<T> =
  | { state: 'observed'; value: T }
  | {
      state: 'missing' | 'unavailable' | 'invalid'
      value: null
      reason: string
    }

export type ProviderWarning = {
  code: string
  message: string
  field?: string
  row?: number
}

export type ProviderImportEvidence = {
  provider: ProviderId
  path: string
  format: 'csv' | 'json' | 'jsonl'
  encoding: 'utf-8' | 'utf-16be' | 'utf-16le'
  delimiter: ',' | ';' | '\t' | null
  columnMapping: ResearchImportColumns | null
  sha256: string
  exportedAt: string
  importedAt: string
  includedFields: string[]
  fileBytes: number
  bytesRead: number
  fileRows: number
  suppliedRows: number
  validRows: number
  filteredRows: number
  invalidRows: number
  duplicateRows: number
  capped: boolean
  rowLimit: number
}

export type KeywordMetric = {
  keyword: string
  monthlySearchVolume: ProviderValue<number>
  monthlySearches: ProviderValue<KeywordMonthlySearch[]>
  searchVolumeUpdatedAt: ProviderValue<string>
  cpcUsd: ProviderValue<number>
  paidCompetition: ProviderValue<number>
  keywordDifficulty: ProviderValue<number>
  intent: ProviderValue<string>
  resultCount: ProviderValue<number>
}

export type KeywordMonthlySearch = {
  year: number
  month: number
  searchVolume: number
}
