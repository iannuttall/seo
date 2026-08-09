import assert from 'node:assert/strict'
import { test } from 'node:test'
import { safePublicFetchMessage } from './public-fetch-errors.ts'

test('categorizes DNS failures without returning upstream details', () => {
  const error = Object.assign(new TypeError('fetch failed'), {
    cause: Object.assign(new Error('getaddrinfo namesensus.com'), {
      code: 'ENOTFOUND',
    }),
  })
  const message = safePublicFetchMessage(error, 'sitemap')

  assert.equal(message, 'The hostname for the sitemap could not be resolved.')
  assert.doesNotMatch(message, /namesensus/u)
})

test('categorizes secure connection failures', () => {
  assert.equal(
    safePublicFetchMessage(
      new Error('certificate verify failed for private.example'),
      'sitemap',
    ),
    'A secure connection to the server hosting the sitemap could not be established.',
  )
})

test('categorizes ordinary network failures', () => {
  assert.equal(
    safePublicFetchMessage(new TypeError('Failed to fetch'), 'robots.txt file'),
    'The server hosting the robots.txt file could not be reached.',
  )
})

test('uses a safe fallback for unfamiliar failures', () => {
  const message = safePublicFetchMessage(
    new Error('private implementation detail'),
    'sitemap',
  )

  assert.equal(message, 'The sitemap could not be fetched.')
  assert.doesNotMatch(message, /implementation detail/u)
})
