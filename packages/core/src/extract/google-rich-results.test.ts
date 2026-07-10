import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assessGoogleRichResults,
  selectGoogleRichResultAssessments,
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
  assert.match(observed?.limitations[0] ?? '', /nested/i)
})

test('Product assessment rejects wrong value types and validates nested branches', () => {
  const wrongTypes = assess('Product', {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: false,
    offers: true,
  })
  assert.equal(wrongTypes?.status, 'missing-required-properties')
  assert.deepEqual(wrongTypes?.missingRequiredProperties, [
    'name',
    'one of review, aggregateRating, or offers',
  ])

  const incompleteOffer = assess('Product', {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Example product',
    offers: { '@type': 'Offer', priceCurrency: 'GBP' },
  })
  assert.deepEqual(incompleteOffer?.missingRequiredProperties, [
    'one of review, aggregateRating, or offers',
  ])

  const invalidBranches = [
    {
      review: {
        '@type': 'Review',
        author: 'Jane Reviewer',
        reviewRating: 5,
      },
    },
    {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: 4.5,
        reviewCount: 'twelve',
      },
    },
    {
      offers: {
        '@type': 'AggregateOffer',
        lowPrice: 20,
        priceCurrency: false,
      },
    },
  ]
  for (const branch of invalidBranches) {
    const assessment = assess('Product', {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Example product',
      ...branch,
    })
    assert.deepEqual(assessment?.missingRequiredProperties, [
      'one of review, aggregateRating, or offers',
    ])
  }

  const validBranches = [
    {
      review: {
        '@type': 'Review',
        author: { '@type': 'Person', name: 'Jane Reviewer' },
        reviewRating: { '@type': 'Rating', ratingValue: '4 / 5' },
      },
    },
    {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: 4.5,
        reviewCount: 12,
      },
    },
    {
      offers: {
        '@type': 'Offer',
        priceSpecification: {
          '@type': 'PriceSpecification',
          price: '20.00',
        },
      },
    },
    {
      offers: {
        '@type': 'AggregateOffer',
        lowPrice: 20,
        priceCurrency: 'GBP',
      },
    },
  ]
  for (const branch of validBranches) {
    const assessment = assess('Product', {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Example product',
      ...branch,
    })
    assert.equal(assessment?.status, 'required-properties-observed')
  }
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

test('Breadcrumb assessment validates ListItem types, values, and targets', () => {
  const invalid = assess('BreadcrumbList', {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { position: 1, name: false, item: true },
      {
        '@type': 'ListItem',
        position: 0,
        name: { value: 'Current' },
        item: 'javascript:alert(1)',
      },
    ],
  })
  assert.equal(invalid?.status, 'missing-required-properties')
  assert.deepEqual(invalid?.missingRequiredProperties, [
    'itemListElement[0].@type ListItem',
    'itemListElement[0].name',
    'itemListElement[0].item',
    'itemListElement[1].position',
    'itemListElement[1].name',
    'itemListElement[1].item',
  ])

  const observed = assess('BreadcrumbList', {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        item: { '@id': '/guides', name: 'Guides' },
      },
      {
        '@type': ['Thing', 'https://schema.org/ListItem'],
        position: 2,
        name: 'Current page',
      },
    ],
  })
  assert.equal(observed?.status, 'required-properties-observed')
  assert.deepEqual(observed?.missingRequiredProperties, [])
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

test('bounded rich-result evidence prioritizes failures and reports omissions', () => {
  const complete = Array.from(
    { length: 55 },
    (_, block) =>
      assessGoogleRichResults({
        block,
        path: `$[${block}]`,
        nodeTypes: ['Product'],
        record: {
          '@type': 'Product',
          name: `Product ${block}`,
          offers: { '@type': 'Offer', price: block + 1 },
        },
      })[0],
  ).filter((assessment) => assessment !== undefined)
  const incomplete = assessGoogleRichResults({
    block: 55,
    path: '$[55]',
    nodeTypes: ['Product'],
    record: { '@type': 'Product' },
  })[0]
  assert.ok(incomplete)

  const forward = selectGoogleRichResultAssessments([...complete, incomplete])
  const reverse = selectGoogleRichResultAssessments([
    incomplete,
    ...[...complete].reverse(),
  ])

  assert.deepEqual(forward, reverse)
  assert.equal(forward.assessments.length, 50)
  assert.equal(forward.assessments[0]?.status, 'missing-required-properties')
  assert.deepEqual(forward.selection, {
    limit: 50,
    eligible: 56,
    returned: 50,
    omitted: 6,
    partial: true,
    eligibleByStatus: {
      'no-required-properties': 0,
      'required-properties-observed': 55,
      'missing-required-properties': 1,
      retired: 0,
      'not-assessed': 0,
    },
    returnedByStatus: {
      'no-required-properties': 0,
      'required-properties-observed': 49,
      'missing-required-properties': 1,
      retired: 0,
      'not-assessed': 0,
    },
    omittedByStatus: {
      'no-required-properties': 0,
      'required-properties-observed': 6,
      'missing-required-properties': 0,
      retired: 0,
      'not-assessed': 0,
    },
  })
})

test('bounded rich-result evidence counts failures that exceed the detail limit', () => {
  const incomplete = Array.from(
    { length: 55 },
    (_, block) =>
      assessGoogleRichResults({
        block,
        path: `$[${block}]`,
        nodeTypes: ['Product'],
        record: { '@type': 'Product' },
      })[0],
  ).filter((assessment) => assessment !== undefined)

  const result = selectGoogleRichResultAssessments(incomplete)

  assert.equal(result.assessments.length, 50)
  assert.equal(
    result.selection.eligibleByStatus['missing-required-properties'],
    55,
  )
  assert.equal(
    result.selection.returnedByStatus['missing-required-properties'],
    50,
  )
  assert.equal(
    result.selection.omittedByStatus['missing-required-properties'],
    5,
  )
  assert.equal(result.selection.partial, true)
})
