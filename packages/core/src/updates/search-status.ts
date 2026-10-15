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

export const INCIDENTS_URL = 'https://status.search.google.com/incidents.json'

export async function fetchSearchStatusIncidents(): Promise<
  SearchStatusIncident[]
> {
  const response = await fetch(INCIDENTS_URL)
  if (!response.ok) {
    throw new SeoError(
      'OPTIONAL_PROVIDER_UNAVAILABLE',
      `Google Search Status fetch failed with ${response.status}.`,
    )
  }
  return (await response.json()) as SearchStatusIncident[]
}

export async function listSearchUpdates(
  input: { product?: string; limit?: number } = {},
): Promise<SearchUpdate[]> {
  return searchUpdatesFromIncidents(await fetchSearchStatusIncidents(), input)
}
