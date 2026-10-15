import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assessGoogleRichResults,
  selectGoogleRichResultAssessments,
} from './google-rich-results.js'

function assess(schemaType: string, record: Record<string, unknown>) {
  return assessGoogleRichResults({
    block: 0,
    path: '$',
    nodeTypes: [schemaType],
    record,
  })[0]
}

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
