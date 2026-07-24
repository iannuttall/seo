import type { z } from 'zod'
import type { KeywordIdea, KeywordMetric, ProviderValue } from '../contracts.js'
import { observedValue, unavailableValue } from '../contracts.js'
import type {
  ahrefsIntentsSchema,
  ahrefsKeywordOverviewResponseSchema,
} from './schema.js'

type AhrefsKeywordOverviewRow = z.infer<
  typeof ahrefsKeywordOverviewResponseSchema
>['keywords'][number]
type AhrefsIntents = z.infer<typeof ahrefsIntentsSchema>
type KeywordField = Exclude<keyof KeywordMetric, 'keyword'>

const INTENT_ORDER = [
  'informational',
  'navigational',
  'commercial',
  'transactional',
  'branded',
  'local',
] as const satisfies readonly (keyof AhrefsIntents)[]

function missing<T>(field: KeywordField): ProviderValue<T> {
  return unavailableValue('missing', `Ahrefs omitted ${field}.`)
}

function unavailable<T>(field: KeywordField): ProviderValue<T> {
  return unavailableValue(
    'unavailable',
    `The selected Ahrefs fields do not return ${field}.`,
  )
}

function numberValue(
  values: Array<number | null | undefined>,
  field: KeywordField,
  transform: (value: number) => number = (value) => value,
): ProviderValue<number> {
  const present = values.filter(
    (value): value is number => value !== null && value !== undefined,
  )
  if (present.length === 0) return missing(field)
  const unique = [...new Set(present.map(transform))]
  return unique.length === 1
    ? observedValue(unique[0] as number)
    : unavailableValue(
        'invalid',
        `Ahrefs returned conflicting ${field} values.`,
      )
}

function intentLabel(value: AhrefsIntents | null): string | null {
  if (!value) return null
  const labels = INTENT_ORDER.filter((label) => value[label])
  return labels.length ? labels.join(',') : null
}

function intentValue(
  values: Array<AhrefsIntents | null | undefined>,
): ProviderValue<string> {
  const present = values
    .map((value) => (value ? intentLabel(value) : null))
    .filter((value): value is string => Boolean(value))
  if (present.length === 0) return missing('intent')
  const unique = [...new Set(present)]
  return unique.length === 1
    ? observedValue(unique[0] as string)
    : unavailableValue('invalid', 'Ahrefs returned conflicting intent labels.')
}

export function ahrefsKeywordMetric(
  keyword: string,
  rows: AhrefsKeywordOverviewRow[],
): KeywordMetric {
  return {
    keyword,
    monthlySearchVolume: numberValue(
      rows.map((row) => row.volume),
      'monthlySearchVolume',
    ),
    monthlySearches: unavailable('monthlySearches'),
    searchVolumeUpdatedAt: unavailable('searchVolumeUpdatedAt'),
    cpcUsd: numberValue(
      rows.map((row) => row.cpc),
      'cpcUsd',
      (value) => value / 100,
    ),
    paidCompetition: unavailable('paidCompetition'),
    keywordDifficulty: numberValue(
      rows.map((row) => row.difficulty),
      'keywordDifficulty',
    ),
    intent: intentValue(rows.map((row) => row.intents)),
    resultCount: unavailable('resultCount'),
  }
}

export function emptyAhrefsKeywordIdea(
  keyword: string,
  sources: KeywordIdea['sources'],
): KeywordIdea {
  return {
    keyword,
    sources,
    monthlySearchVolume: unavailable('monthlySearchVolume'),
    monthlySearches: unavailable('monthlySearches'),
    searchVolumeUpdatedAt: unavailable('searchVolumeUpdatedAt'),
    cpcUsd: unavailable('cpcUsd'),
    paidCompetition: unavailable('paidCompetition'),
    keywordDifficulty: unavailable('keywordDifficulty'),
    intent: unavailable('intent'),
    resultCount: unavailable('resultCount'),
  }
}
