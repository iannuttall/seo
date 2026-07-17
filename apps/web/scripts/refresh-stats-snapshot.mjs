// Refresh the committed telemetry stats snapshot. The stats page renders
// this file at build time so the static HTML and its Markdown twin carry
// real numbers while staying byte-deterministic for a given commit.
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const target = resolve(import.meta.dirname, '../src/data/stats-snapshot.json')
const response = await fetch('https://seoskill.dev/api/stats', {
  headers: { accept: 'application/json' },
})
if (!response.ok) {
  throw new Error(`Stats request failed: ${response.status}`)
}
const snapshot = await response.json()
await writeFile(target, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
console.log(`Wrote ${target} (generatedAt ${snapshot.generatedAt})`)
