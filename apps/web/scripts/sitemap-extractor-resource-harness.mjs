import assert from 'node:assert/strict'
import { handleSitemapExtraction } from '../worker/tools/sitemap-extractor.ts'

const totalUrls = 50_000
const encoder = new TextEncoder()
const baselineRss = process.memoryUsage().rss
let inputBytes = 0
let fetches = 0

function sitemapStream() {
  let index = -1
  return new ReadableStream({
    pull(controller) {
      if (index === -1) {
        const chunk = encoder.encode('<urlset>')
        inputBytes += chunk.byteLength
        controller.enqueue(chunk)
        index = 0
        return
      }
      if (index >= totalUrls) {
        const chunk = encoder.encode('</urlset>')
        inputBytes += chunk.byteLength
        controller.enqueue(chunk)
        controller.close()
        return
      }
      const end = Math.min(totalUrls, index + 500)
      let xml = ''
      while (index < end) {
        xml += `<url><loc>https://example.com/catalog/item-${index}</loc></url>`
        index += 1
      }
      const chunk = encoder.encode(xml)
      inputBytes += chunk.byteLength
      controller.enqueue(chunk)
    },
  })
}

const request = new Request(
  'https://seoskill.dev/api/tools/sitemap-extractor',
  {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://seoskill.dev',
      'sec-fetch-site': 'same-origin',
    },
    body: JSON.stringify({
      url: 'https://example.com/sitemap.xml',
      maxUrls: totalUrls,
    }),
  },
)

const startedAt = performance.now()
let peakRss = process.memoryUsage().rss
const response = await handleSitemapExtraction(request, async () => {
  fetches += 1
  return new Response(sitemapStream(), {
    headers: { 'content-type': 'application/xml' },
  })
})
assert.equal(response.status, 200)
assert.ok(response.body)

const reader = response.body.getReader()
const decoder = new TextDecoder()
let remainder = ''
let outputBytes = 0
let records = 0
let urlRecords = 0
let complete
while (true) {
  const chunk = await reader.read()
  if (chunk.done) break
  outputBytes += chunk.value.byteLength
  peakRss = Math.max(peakRss, process.memoryUsage().rss)
  const lines =
    `${remainder}${decoder.decode(chunk.value, { stream: true })}`.split('\n')
  remainder = lines.pop() ?? ''
  for (const line of lines) {
    if (!line) continue
    records += 1
    const event = JSON.parse(line)
    if (event.type === 'url') urlRecords += 1
    else if (event.type === 'complete') complete = event
  }
}
remainder += decoder.decode()
if (remainder.trim()) {
  records += 1
  const event = JSON.parse(remainder)
  if (event.type === 'url') urlRecords += 1
  else if (event.type === 'complete') complete = event
}

const elapsedMilliseconds = Math.round(performance.now() - startedAt)
assert.equal(fetches, 1)
assert.equal(urlRecords, totalUrls)
assert.equal(complete?.dataStatus, 'complete')
assert.equal(complete?.urlsReturned, totalUrls)
assert.ok(records <= totalUrls + 4)
assert.ok(outputBytes < 32_000_000)
assert.ok(peakRss - baselineRss < 80_000_000)

process.stdout.write(
  `${JSON.stringify(
    {
      fixtureUrls: totalUrls,
      fetches,
      records,
      inputBytes,
      outputBytes,
      baselineRssBytes: baselineRss,
      peakRssBytes: peakRss,
      peakRssIncreaseBytes: peakRss - baselineRss,
      elapsedMilliseconds,
    },
    null,
    2,
  )}\n`,
)
