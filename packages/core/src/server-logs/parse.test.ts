import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  classifyCrawler,
  parseCombinedLogLine,
  parseJsonLogLine,
} from './parse.js'

describe('server log parsing', () => {
  test('parses a combined log row and removes query cardinality', () => {
    assert.deepEqual(
      parseCombinedLogLine(
        '127.0.0.1 - - [10/Oct/2025:13:55:36 +0100] "GET /products?id=2 HTTP/1.1" 404 123 "-" "Googlebot/2.1"',
      ),
      {
        timestamp: '2025-10-10T12:55:36.000Z',
        method: 'GET',
        path: '/products',
        status: 404,
        bytes: 123,
        userAgent: 'Googlebot/2.1',
        crawler: { family: 'Googlebot', category: 'search' },
      },
    )
  })

  test('parses common JSON log aliases', () => {
    assert.deepEqual(
      parseJsonLogLine(
        JSON.stringify({
          '@timestamp': '2025-10-10T12:55:36Z',
          requestMethod: 'get',
          requestUri: 'https://example.test/docs?ref=one',
          statusCode: 200,
          bodyBytesSent: 42,
          user_agent: 'OAI-SearchBot/1.0',
        }),
      ),
      {
        timestamp: '2025-10-10T12:55:36.000Z',
        method: 'GET',
        path: '/docs',
        status: 200,
        bytes: 42,
        userAgent: 'OAI-SearchBot/1.0',
        crawler: { family: 'OpenAI', category: 'ai' },
      },
    )
  })

  test('rejects malformed rows and does not classify ordinary browsers', () => {
    assert.equal(parseCombinedLogLine('not a log row'), undefined)
    assert.equal(parseJsonLogLine('{bad'), undefined)
    assert.equal(classifyCrawler('Mozilla/5.0 Chrome/130'), undefined)
  })
})
