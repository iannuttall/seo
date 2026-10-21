// Pure parsing of the Google Search Status incident feed, shared by the
// local client and the hosted MCP.

import { RANKING_HISTORY } from './ranking-history.js'

// Days either side of the checked dates that still count as overlap.
export const UPDATE_PADDING_DAYS = 3

export interface SearchStatusIncident {
  id: string
  begin: string
  end?: string
  external_desc: string
  service_name: string
  status_impact: string
  severity: string
  uri: string
}

export interface SearchUpdate {
  id: string
  name: string
  type:
    | 'core'
    | 'spam'
    | 'discover'
    | 'ranking'
    | 'indexing'
    | 'serving'
    | 'other'
  product: string
  start: string
  end?: string
  status: 'complete' | 'rolling-out' | 'incident'
  sourceUrl: string
}

function classifyUpdate(name: string, product: string): SearchUpdate['type'] {
  const lower = `${name} ${product}`.toLowerCase()
  if (lower.includes('core')) return 'core'
  if (lower.includes('spam')) return 'spam'
  if (lower.includes('discover')) return 'discover'
  if (lower.includes('ranking')) return 'ranking'
  if (lower.includes('index')) return 'indexing'
  if (lower.includes('serving')) return 'serving'
  return 'other'
}

export function searchUpdatesFromIncidents(
  incidents: SearchStatusIncident[],
  input: { product?: string; limit?: number } = {},
): SearchUpdate[] {
  const product = input.product?.toLowerCase()

  return incidents
    .filter(
      (incident) => !product || incident.service_name.toLowerCase() === product,
    )
    .map((incident) => {
      const status: SearchUpdate['status'] = incident.end
        ? 'complete'
        : incident.status_impact === 'SERVICE_INFORMATION'
          ? 'rolling-out'
          : 'incident'

      return {
        id: incident.id,
        name: incident.external_desc,
        type: classifyUpdate(incident.external_desc, incident.service_name),
        product: incident.service_name,
        start: incident.begin,
        end: incident.end,
        status,
        sourceUrl: `https://status.search.google.com/${incident.uri}`,
      }
    })
    .slice(0, input.limit ?? 25)
}

// The live feed keeps only Google's latest few incidents. This adds every
// earlier Ranking update from the saved history, newest first. A live
// incident wins over its saved copy, so a rollout that has since ended shows
// its end.
export function withRankingHistory(
  live: SearchStatusIncident[],
): SearchStatusIncident[] {
  const byId = new Map<string, SearchStatusIncident>()
  for (const saved of RANKING_HISTORY) {
    byId.set(saved.id, {
      ...saved,
      service_name: 'Ranking',
      status_impact: 'SERVICE_INFORMATION',
      severity: 'low',
      uri: `incidents/${saved.id}`,
    })
  }
  for (const incident of live) byId.set(incident.id, incident)
  return [...byId.values()].sort(
    (left, right) =>
      Date.parse(right.begin) - Date.parse(left.begin) ||
      (left.id < right.id ? -1 : 1),
  )
}

export function findOverlappingSearchUpdates(input: {
  updates: SearchUpdate[]
  startDate: string
  endDate: string
  paddingDays?: number
}): SearchUpdate[] {
  const paddingMs = (input.paddingDays ?? 3) * 86_400_000
  const windowStart = new Date(input.startDate).getTime() - paddingMs
  const windowEnd = new Date(input.endDate).getTime() + paddingMs

  return input.updates.filter((update) => {
    const updateStart = new Date(update.start).getTime()
    const updateEnd = update.end ? new Date(update.end).getTime() : Date.now()
    return updateStart <= windowEnd && updateEnd >= windowStart
  })
}
