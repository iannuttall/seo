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
    'blue-widget',
    'green-widget',
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

test('clusterPseoTemplates excludes singleton static pages', () => {
  assert.deepEqual(
    clusterPseoTemplates(['https://example.com/about'], { minShare: 0 }),
    [],
  )
})

test('clusterPseoTemplates excludes repeated URLs without a variable path', () => {
  assert.deepEqual(
    clusterPseoTemplates(
      [
        'https://example.com/',
        'https://example.com/?source=one',
        'https://example.com/?source=two',
        'https://example.com/about',
        'https://example.com/about?source=one',
        'https://example.com/about?source=two',
      ],
      { minShare: 0 },
    ),
    [],
  )
})

test('clusterPseoTemplates keeps Unicode and numeric variable evidence', () => {
  const [cluster] = clusterPseoTemplates([
    'https://example.com/models/x5/東京',
    'https://example.com/models/x7/大阪',
    'https://example.com/models/x9/京都',
  ])

  assert.equal(cluster?.signature, '/models/:value/:value')
  assert.deepEqual(cluster?.shape.variableSegments[0]?.tokenExamples, [
    'x5',
    'x7',
    'x9',
  ])
  assert.deepEqual(cluster?.shape.variableSegments[1]?.tokenExamples, [
    '京都',
    '大阪',
    '東京',
  ])
})
