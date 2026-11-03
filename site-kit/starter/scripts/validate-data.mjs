// Fails when the data would make a wrong or broken page: a missing field,
// a duplicate slug, a fact with no source, or a number outside its range.
// Add a rule here for every mistake you find in your own data.
import { readFile } from 'node:fs/promises'

const parks = JSON.parse(await readFile('src/data/parks.json', 'utf8'))
const sources = JSON.parse(await readFile('src/data/sources.json', 'utf8'))
const sourceIds = new Set(sources.map((source) => source.id))
const errors = []
const slugs = new Set()

for (const source of sources) {
  if (!/^https?:\/\//.test(source.url)) errors.push(`${source.id}: bad url`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source.checked)) {
    errors.push(`${source.id}: checked must be a YYYY-MM-DD date`)
  }
}

for (const park of parks) {
  const at = park.slug ?? JSON.stringify(park).slice(0, 40)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(park.slug ?? '')) {
    errors.push(`${at}: slug must be lowercase words joined by hyphens`)
  }
  if (slugs.has(park.slug)) errors.push(`${at}: duplicate slug`)
  slugs.add(park.slug)
  if (!park.name?.trim()) errors.push(`${at}: missing name`)
  if (!park.region?.trim()) errors.push(`${at}: missing region`)
  if (!sourceIds.has(park.source)) errors.push(`${at}: unknown source`)
  if (!(park.areaHectares > 0 && park.areaHectares < 10_000)) {
    errors.push(`${at}: areaHectares out of range`)
  }
  if (!(park.opened >= 1500 && park.opened <= new Date().getFullYear())) {
    errors.push(`${at}: opened out of range`)
  }
  if (!['yes', 'on leads', 'no'].includes(park.dogs)) {
    errors.push(`${at}: dogs must be yes, on leads or no`)
  }
  if (park.parkingSpaces !== null && !(park.parkingSpaces >= 0)) {
    errors.push(`${at}: parkingSpaces must be a number or null`)
  }
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log(`${parks.length} parks and ${sources.length} sources are valid.`)
