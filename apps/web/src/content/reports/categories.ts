import type { ReportCategory, ReportEditorial } from './types'

export type ReportCategoryEditorial = {
  id: ReportCategory
  label: string
  introduction: string
}

export const reportCategoryEditorial = [
  {
    id: 'setup',
    label: 'Setup',
    introduction:
      'Fix local setup and sign-in problems before you investigate a site.',
  },
  {
    id: 'diagnosis',
    label: 'Property diagnosis',
    introduction:
      'Find where a property changed and which evidence deserves a closer look.',
  },
  {
    id: 'opportunities',
    label: 'Search opportunities',
    introduction:
      'Turn existing search visibility into limited page, query, and link review queues.',
  },
  {
    id: 'crawl',
    label: 'Crawling and technical checks',
    introduction:
      'Inspect live technical evidence, then reuse one saved crawl for focused follow-ups.',
  },
  {
    id: 'monitoring',
    label: 'Technical monitoring',
    introduction:
      'Catch technical, redirect, and indexed-state changes without confusing missing evidence with a recovery.',
  },
  {
    id: 'reporting',
    label: 'Reporting',
    introduction:
      'Explain page, property, and template evidence clearly enough for someone to act on it.',
  },
  {
    id: 'experiments',
    label: 'Change measurement',
    introduction:
      'Measure a recorded change with matched windows and visible confounders.',
  },
  {
    id: 'ai-search',
    label: 'AI search evidence',
    introduction:
      'Review observed search, referral, page, and performance evidence without inventing AI visibility scores.',
  },
  {
    id: 'workflows',
    label: 'Multi-report workflows',
    introduction:
      'Combine focused reports into a small next-action sequence for an agent.',
  },
] as const satisfies readonly ReportCategoryEditorial[]

export const reportCategoryById = new Map(
  reportCategoryEditorial.map((category) => [category.id, category]),
)

const categoryOrder = new Map(
  reportCategoryEditorial.map((category, index) => [category.id, index]),
)

export function orderReportsForReaders(
  reports: readonly ReportEditorial[],
): ReportEditorial[] {
  return [...reports].sort(
    (left, right) =>
      (categoryOrder.get(left.category) ?? Number.MAX_SAFE_INTEGER) -
      (categoryOrder.get(right.category) ?? Number.MAX_SAFE_INTEGER),
  )
}
