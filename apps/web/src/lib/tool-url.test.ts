import assert from 'node:assert/strict'
import { test } from 'node:test'
import { defaultToolUrlToHttps } from './tool-url.ts'

test('defaults scheme-less tool URLs to HTTPS', () => {
  assert.equal(
    defaultToolUrlToHttps(' example.com/sitemap.xml '),
    'https://example.com/sitemap.xml',
  )
  assert.equal(
    defaultToolUrlToHttps('//example.com/robots.txt'),
    'https://example.com/robots.txt',
  )
})

test('preserves explicit protocols for validation at the API boundary', () => {
  assert.equal(
    defaultToolUrlToHttps('https://example.com/sitemap.xml'),
    'https://example.com/sitemap.xml',
  )
  assert.equal(
    defaultToolUrlToHttps('http://example.com/sitemap.xml'),
    'http://example.com/sitemap.xml',
  )
  assert.equal(
    defaultToolUrlToHttps('ftp://example.com/file.txt'),
    'ftp://example.com/file.txt',
  )
})
