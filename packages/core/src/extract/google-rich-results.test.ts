import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assessGoogleRichResults,
  unassessedGoogleRichResult,
} from './google-rich-results.js'

function assess(schemaType: string, record: Record<string, unknown>) {
  return assessGoogleRichResults({
    block: 0,
    path: '$',
    nodeTypes: [schemaType],
    record,
  })[0]
}

test('Product assessment separates syntax from required property evidence', () => {
  const incomplete = assess('Product', {
    '@context': 'https://schema.org',
    '@type': 'Product',
  })
  assert.equal(incomplete?.status, 'missing-required-properties')
  assert.deepEqual(incomplete?.missingRequiredProperties, [
    'name',
    'one of review, aggregateRating, or offers',
  ])

  const observed = assess('Product', {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Example product',
    offers: { '@type': 'Offer', price: '20.00' },
  })
  assert.equal(observed?.status, 'required-properties-observed')
  assert.deepEqual(observed?.observedProperties, ['name', 'offers'])
  assert.match(observed?.limitations[0] ?? '', /Nested/)
})

test('Breadcrumb assessment reports exact missing ListItem properties', () => {
  const assessment = assess('BreadcrumbList', {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Guides' },
      { '@type': 'ListItem', position: 2 },
    ],
  })

  assert.equal(assessment?.status, 'missing-required-properties')
  assert.deepEqual(assessment?.missingRequiredProperties, [
    'itemListElement[0].item',
    'itemListElement[1].name',
  ])
})

test('Article and FAQ assessments preserve current Google feature status', () => {
  const article = assess('Article', {
    '@context': 'https://schema.org',
    '@type': 'Article',
  })
  const faq = assess('FAQPage', {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [],
  })

  assert.equal(article?.status, 'no-required-properties')
  assert.equal(faq?.status, 'retired')
  assert.match(faq?.limitations[0] ?? '', /stopped appearing/)
  assert.equal(assess('WebPage', { '@type': 'WebPage' }), undefined)
})

test('Microdata and RDFa coverage stays explicitly unassessed', () => {
  const assessment = unassessedGoogleRichResult({
    format: 'microdata',
    schemaType: 'Product',
  })[0]

  assert.equal(assessment?.status, 'not-assessed')
  assert.equal(assessment?.format, 'microdata')
  assert.match(assessment?.limitations[0] ?? '', /property-level extraction/)
  assert.deepEqual(
    unassessedGoogleRichResult({ format: 'rdfa', schemaType: 'WebPage' }),
    [],
  )
})
