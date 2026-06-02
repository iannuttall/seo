import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clusterPseoTemplates, templateForUrl } from './templates.js'

test('clusterPseoTemplates infers static and variable path shape', () => {
  const urls = [
    'https://example.com/catalog/red-widget/specs',
    'https://example.com/catalog/blue-widget/specs',
    'https://example.com/catalog/green-widget/specs',
    'https://example.com/catalog/yellow-widget/specs',
  ]

  const [cluster] = clusterPseoTemplates(urls)

  assert.equal(cluster?.signature, '/catalog/:slug/specs')
  assert.deepEqual(cluster?.shape.staticSegments, [
    { index: 0, value: 'catalog' },
    { index: 2, value: 'specs' },
  ])
  assert.equal(cluster?.shape.variableSegments.length, 1)
  assert.equal(cluster?.shape.variableSegments[0]?.index, 1)
  assert.equal(cluster?.shape.variableSegments[0]?.distinctValues, 4)
  assert.deepEqual(cluster?.shape.variableSegments[0]?.examples.slice(0, 2), [
    'red-widget',
    'blue-widget',
  ])
})

test('templateForUrl still resolves broad templates for sparse URL shapes', () => {
  const clusters = clusterPseoTemplates([
    'https://example.com/library/alpha-guide',
    'https://example.com/library/beta-reference',
    'https://example.com/library/gamma-overview',
  ])

  assert.equal(
    templateForUrl('https://example.com/library/delta-notes', clusters),
    '/library/:slug',
  )
})
