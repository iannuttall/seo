import { fetch } from 'undici'
import { SeoError } from '../errors.js'
import {
  type SearchStatusIncident,
  type SearchUpdate,
  searchUpdatesFromIncidents,
} from './search-updates.js'

export {
  findOverlappingSearchUpdates,
  type SearchStatusIncident,
  type SearchUpdate,
  searchUpdatesFromIncidents,
} from './search-updates.js'

import { readJson } from '../http/read-json.js'

export const INCIDENTS_URL = 'https://status.search.google.com/incidents.json'

export async function fetchSearchStatusIncidents(): Promise<
  SearchStatusIncident[]
> {
  const response = await fetch(INCIDENTS_URL, {
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) {
    throw new SeoError(
      'OPTIONAL_PROVIDER_UNAVAILABLE',
      `Google Search Status fetch failed with ${response.status}.`,
    )
  }
  return readJson<SearchStatusIncident[]>(
    response as unknown as Response,
    'Google Search Status',
    { maxBytes: 10 * 1024 * 1024 },
  )
}

export async function listSearchUpdates(
  input: { product?: string; limit?: number } = {},
): Promise<SearchUpdate[]> {
  return searchUpdatesFromIncidents(await fetchSearchStatusIncidents(), input)
}
