import assert from 'node:assert/strict'
import test from 'node:test'
import { ProviderError } from '../errors.js'
import { parseSemrushCsv } from './csv.js'

test('Semrush CSV handles escaped separators, quotes, and newlines', () => {
  assert.deepEqual(
    parseSemrushCsv(
      '\uFEFF"Keyword";"Url";"Note"\r\n"seo; tools";"https://example.com/a";"one ""quoted""\nline"\r\n',
      1,
    ),
    {
      headers: ['Keyword', 'Url', 'Note'],
      rows: [['seo; tools', 'https://example.com/a', 'one "quoted"\nline']],
    },
  )
})

test('Semrush CSV rejects malformed and over-limit responses', () => {
  for (const body of [
    '"Keyword\nseo',
    'Keyword;Volume\nseo',
    'Keyword\none\ntwo',
  ]) {
    assert.throws(
      () => parseSemrushCsv(body, 1),
      (error) =>
        error instanceof ProviderError && error.code === 'invalid-response',
    )
  }
})
