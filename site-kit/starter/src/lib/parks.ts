import parksData from '../data/parks.json'
import sourcesData from '../data/sources.json'

export type Park = {
  slug: string
  name: string
  region: string
  areaHectares: number
  opened: number
  toilets: boolean
  cafe: boolean
  playground: boolean
  dogs: 'yes' | 'on leads' | 'no'
  // null means the register does not say. 0 means no parking.
  parkingSpaces: number | null
  source: string
}

export type Source = {
  id: string
  name: string
  url: string
  checked: string
}

export const parks = (parksData as Park[])
  .slice()
  .sort((a, b) => a.name.localeCompare(b.name))
const sources = sourcesData as Source[]

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function sourceFor(park: Park): Source {
  const source = sources.find((entry) => entry.id === park.source)
  if (!source) throw new Error(`${park.slug}: unknown source ${park.source}`)
  return source
}

export type Region = { name: string; slug: string; parks: Park[] }

export const regions: Region[] = [...new Set(parks.map((park) => park.region))]
  .sort((a, b) => a.localeCompare(b))
  .map((name) => ({
    name,
    slug: slugify(name),
    parks: parks.filter((park) => park.region === name),
  }))

export function regionFor(park: Park): Region {
  const region = regions.find((entry) => entry.name === park.region)
  if (!region) throw new Error(`${park.slug}: unknown region`)
  return region
}

export function formatHectares(value: number): string {
  return `${value.toLocaleString('en-GB', { maximumFractionDigits: 1 })} hectares`
}

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function facilities(park: Park): string[] {
  return [
    park.toilets ? 'toilets' : '',
    park.cafe ? 'a cafe' : '',
    park.playground ? 'a playground' : '',
  ].filter(Boolean)
}

export function listText(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}
