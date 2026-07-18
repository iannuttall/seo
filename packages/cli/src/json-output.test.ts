import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { test } from 'node:test'
import { writeJsonStream } from './json-output.js'

async function streamedJson(value: unknown): Promise<string> {
  const stream = new PassThrough()
  let output = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk: string) => {
    output += chunk
  })
  await writeJsonStream(stream, value)
  return output
}

test('streamed JSON matches pretty JSON output', async () => {
  const value = {
    id: 'crawl-1',
    finite: 3.5,
    nonFinite: Number.NaN,
    missing: undefined,
    pages: [{ url: 'https://example.com/', status: 200 }, undefined, null],
    empty: {},
  }

  assert.equal(await streamedJson(value), `${JSON.stringify(value, null, 2)}\n`)
})

test('streamed JSON rejects circular structures', async () => {
  const value: { self?: unknown } = {}
  value.self = value

  await assert.rejects(() => streamedJson(value), /circular structure/i)
})
