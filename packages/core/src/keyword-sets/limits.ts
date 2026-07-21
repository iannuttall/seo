export const KEYWORD_SET_LIMITS = {
  setsPerProject: 25,
  totalSets: 100,
  keywordsPerSet: 10_000,
  totalKeywords: 100_000,
  mutationKeywords: 1_000,
  tagsPerKeyword: 20,
  outputRows: 1_000,
  logicalBytes: 64 * 1024 * 1024,
} as const

export const KEYWORD_SET_FIELD_LIMITS = {
  name: 80,
  projectId: 80,
  sourceReport: 100,
  keyword: 80,
  keywordWords: 10,
  tag: 40,
  url: 2_048,
  metricJsonBytes: 16 * 1024,
} as const
