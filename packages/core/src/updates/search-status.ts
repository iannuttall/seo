import { fetch } from 'undici'

const INCIDENTS_URL = 'https://status.search.google.com/incidents.json'

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

export async function fetchSearchStatusIncidents(): Promise<
  SearchStatusIncident[]
> {
  const response = await fetch(INCIDENTS_URL)
  if (!response.ok) {
    throw new Error(
      `Google Search Status fetch failed with ${response.status}.`,
    )
  }
  return (await response.json()) as SearchStatusIncident[]
}

export async function listSearchUpdates(
  input: { product?: string; limit?: number } = {},
): Promise<SearchUpdate[]> {
  const incidents = await fetchSearchStatusIncidents()
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
