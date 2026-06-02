import type { SearchAnalyticsRequest } from '../../../gsc/client.js'
import type {
  ContentGroup,
  ContentGroupMatchType,
  SeoChange,
} from '../types.js'

function groupOperator(matchType: ContentGroupMatchType) {
  return matchType === 'regex'
    ? 'includingRegex'
    : matchType === 'contains'
      ? 'contains'
      : 'equals'
}

export function filterForChange(
  change: SeoChange,
  group?: ContentGroup,
): SearchAnalyticsRequest['dimensionFilterGroups'] {
  if (change.scope === 'site') return undefined

  const dimension = change.scope === 'group' ? group?.dimension : change.scope
  const expression = change.scope === 'group' ? group?.pattern : change.target
  if (!dimension || !expression) return undefined

  const operator =
    change.scope === 'group' && group
      ? groupOperator(group.matchType)
      : 'equals'

  return [
    {
      groupType: 'and',
      filters: [{ dimension, operator, expression }],
    },
  ]
}
