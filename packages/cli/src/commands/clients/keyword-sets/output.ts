import type { KeywordSet, KeywordSetDetail } from '@seo/core'
import { printKeyValue, printTable } from '../../../utils.js'

export function printKeywordSetList(sets: KeywordSet[]): void {
  if (sets.length === 0) {
    process.stdout.write('No keyword sets saved for this project.\n')
    return
  }
  printTable(
    ['Name', 'Keywords', 'Market', 'Provider', 'Updated'],
    sets.map((set) => [
      set.name,
      set.keywordCount,
      `${set.market.countryCode}/${set.market.languageCode}`,
      set.provider ?? 'automatic',
      set.updatedAt,
    ]),
  )
}

export function printKeywordSet(detail: KeywordSetDetail): void {
  printKeyValue([
    ['Name', detail.set.name],
    ['Project', detail.set.projectId],
    ['Keywords', String(detail.set.keywordCount)],
    [
      'Market',
      `${detail.set.market.searchEngine} ${detail.set.market.countryCode}/${detail.set.market.languageCode}`,
    ],
    ['Provider', detail.set.provider ?? 'automatic'],
    ['Last refreshed', detail.set.lastRefreshedAt ?? 'never'],
  ])
  if (detail.items.length === 0) {
    process.stdout.write('\nNo keywords matched this view.\n')
    return
  }
  process.stdout.write('\n')
  printTable(
    ['Keyword', 'Tags', 'Volume', 'Page'],
    detail.items.map((item) => [
      item.keyword,
      item.tags.join(', ') || '-',
      item.latestMetric?.metric.monthlySearchVolume.state === 'observed'
        ? item.latestMetric.metric.monthlySearchVolume.value
        : '-',
      item.page?.url ?? '-',
    ]),
  )
  if (detail.pagination.nextOffset !== null) {
    process.stdout.write(
      `\nMore rows are available. Continue with --offset ${detail.pagination.nextOffset}.\n`,
    )
  }
}
