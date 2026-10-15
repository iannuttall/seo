import assert from 'node:assert/strict'
import test from 'node:test'
import {
  generateSchemaMarkup,
  SCHEMA_MARKUP_LIMITS,
  schemaScript,
  validateSchemaMarkup,
} from './schema-markup.ts'

const context = 'https://schema.org'
const sampleEmail = ['hello', 'example.com'].join('@')

type GeneratorFixture = {
  id: string
  values: Record<string, string>
  repeats?: Record<string, Array<Record<string, string>>>
  expected: Record<string, unknown>
}

const generatorFixtures: GeneratorFixture[] = [
  {
    id: 'aggregate-rating',
    values: {
      itemType: 'Product',
      itemName: 'Field mug',
      ratingValue: '4.6',
      bestRating: '5',
      worstRating: '1',
      ratingCount: '84',
      reviewCount: '72',
    },
    expected: {
      '@context': context,
      '@type': 'AggregateRating',
      itemReviewed: { '@type': 'Product', name: 'Field mug' },
      ratingValue: 4.6,
      bestRating: 5,
      worstRating: 1,
      ratingCount: 84,
      reviewCount: 72,
    },
  },
  {
    id: 'article',
    values: {
      articleType: 'BlogPosting',
      url: 'https://example.com/guides/field-notes',
      headline: 'Field notes from the coast',
      description: 'A practical guide to recording coastal wildlife.',
      image: 'https://example.com/images/field-notes.jpg',
      authorName: 'Sam Lee',
      authorUrl: 'https://example.com/authors/sam-lee',
      publisherName: 'Field Journal',
      publisherLogo: 'https://example.com/images/logo.png',
      datePublished: '2026-08-01',
      dateModified: '2026-08-10',
    },
    expected: {
      '@context': context,
      '@type': 'BlogPosting',
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': 'https://example.com/guides/field-notes',
      },
      headline: 'Field notes from the coast',
      description: 'A practical guide to recording coastal wildlife.',
      image: 'https://example.com/images/field-notes.jpg',
      author: {
        '@type': 'Person',
        name: 'Sam Lee',
        url: 'https://example.com/authors/sam-lee',
      },
      publisher: {
        '@type': 'Organization',
        name: 'Field Journal',
        logo: {
          '@type': 'ImageObject',
          url: 'https://example.com/images/logo.png',
        },
      },
      datePublished: '2026-08-01',
      dateModified: '2026-08-10',
    },
  },
  {
    id: 'breadcrumb',
    values: {},
    repeats: {
      items: [
        { name: 'Home', url: 'https://example.com/' },
        { name: 'Guides', url: 'https://example.com/guides' },
        {
          name: 'Field notes',
          url: 'https://example.com/guides/field-notes',
        },
      ],
    },
    expected: {
      '@context': context,
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: 'https://example.com/',
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Guides',
          item: 'https://example.com/guides',
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: 'Field notes',
          item: 'https://example.com/guides/field-notes',
        },
      ],
    },
  },
  {
    id: 'event',
    values: {
      name: 'Coastal field workshop',
      url: 'https://example.com/events/coastal-workshop',
      description: 'A one-day wildlife recording workshop.',
      image: 'https://example.com/images/workshop.jpg',
      startDate: '2026-09-12T09:00:00+01:00',
      endDate: '2026-09-12T17:00:00+01:00',
      attendanceMode: 'https://schema.org/MixedEventAttendanceMode',
      locationName: 'Harbour Hall',
      locationUrl: 'https://example.com/events/coastal-workshop/live',
      streetAddress: '8 Shore Road',
      addressLocality: 'Whitby',
      addressRegion: 'North Yorkshire',
      postalCode: 'YO21 1YN',
      addressCountry: 'GB',
      offerUrl: 'https://example.com/events/coastal-workshop/tickets',
      price: '25.00',
      priceCurrency: 'GBP',
    },
    expected: {
      '@context': context,
      '@type': 'Event',
      name: 'Coastal field workshop',
      url: 'https://example.com/events/coastal-workshop',
      description: 'A one-day wildlife recording workshop.',
      image: 'https://example.com/images/workshop.jpg',
      startDate: '2026-09-12T09:00:00+01:00',
      endDate: '2026-09-12T17:00:00+01:00',
      eventAttendanceMode: 'https://schema.org/MixedEventAttendanceMode',
      eventStatus: 'https://schema.org/EventScheduled',
      location: [
        {
          '@type': 'Place',
          name: 'Harbour Hall',
          address: {
            '@type': 'PostalAddress',
            streetAddress: '8 Shore Road',
            addressLocality: 'Whitby',
            addressRegion: 'North Yorkshire',
            postalCode: 'YO21 1YN',
            addressCountry: 'GB',
          },
        },
        {
          '@type': 'VirtualLocation',
          url: 'https://example.com/events/coastal-workshop/live',
        },
      ],
      offers: {
        '@type': 'Offer',
        url: 'https://example.com/events/coastal-workshop/tickets',
        price: '25.00',
        priceCurrency: 'GBP',
        availability: 'https://schema.org/InStock',
      },
    },
  },
  {
    id: 'faq',
    values: {},
    repeats: {
      questions: [
        {
          question: 'What should I bring?',
          answer: 'Bring a notebook and weatherproof clothing.',
        },
        {
          question: 'Is the workshop accessible?',
          answer: 'Yes. The venue has step-free access.',
        },
      ],
    },
    expected: {
      '@context': context,
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'What should I bring?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Bring a notebook and weatherproof clothing.',
          },
        },
        {
          '@type': 'Question',
          name: 'Is the workshop accessible?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. The venue has step-free access.',
          },
        },
      ],
    },
  },
  {
    id: 'job-posting',
    values: {
      title: 'Field research coordinator',
      description: 'Coordinate surveys and publish verified field records.',
      datePosted: '2026-08-10',
      validThrough: '2026-09-10T23:59:59+01:00',
      employmentType: 'FULL_TIME',
      organizationName: 'Field Journal',
      organizationUrl: 'https://example.com/',
      organizationLogo: 'https://example.com/images/logo.png',
      streetAddress: '8 Shore Road',
      addressLocality: 'Whitby',
      addressRegion: 'North Yorkshire',
      postalCode: 'YO21 1YN',
      addressCountry: 'GB',
      salaryMin: '32000',
      salaryMax: '38000',
      salaryCurrency: 'GBP',
      salaryUnit: 'YEAR',
    },
    expected: {
      '@context': context,
      '@type': 'JobPosting',
      title: 'Field research coordinator',
      description: 'Coordinate surveys and publish verified field records.',
      datePosted: '2026-08-10',
      validThrough: '2026-09-10T23:59:59+01:00',
      employmentType: 'FULL_TIME',
      hiringOrganization: {
        '@type': 'Organization',
        name: 'Field Journal',
        sameAs: 'https://example.com/',
        logo: 'https://example.com/images/logo.png',
      },
      jobLocation: {
        '@type': 'Place',
        address: {
          '@type': 'PostalAddress',
          streetAddress: '8 Shore Road',
          addressLocality: 'Whitby',
          addressRegion: 'North Yorkshire',
          postalCode: 'YO21 1YN',
          addressCountry: 'GB',
        },
      },
      baseSalary: {
        '@type': 'MonetaryAmount',
        currency: 'GBP',
        value: {
          '@type': 'QuantitativeValue',
          minValue: '32000',
          maxValue: '38000',
          unitText: 'YEAR',
        },
      },
    },
  },
  {
    id: 'local-business',
    values: {
      businessType: 'LocalBusiness',
      name: 'Harbour Field Supplies',
      url: 'https://example.com/shop',
      image: 'https://example.com/images/shop.jpg',
      telephone: '+44 1947 000000',
      priceRange: '££',
      streetAddress: '8 Shore Road',
      addressLocality: 'Whitby',
      addressRegion: 'North Yorkshire',
      postalCode: 'YO21 1YN',
      addressCountry: 'GB',
      latitude: '54.4863',
      longitude: '-0.6133',
    },
    expected: {
      '@context': context,
      '@type': 'LocalBusiness',
      name: 'Harbour Field Supplies',
      url: 'https://example.com/shop',
      image: 'https://example.com/images/shop.jpg',
      telephone: '+44 1947 000000',
      priceRange: '££',
      address: {
        '@type': 'PostalAddress',
        streetAddress: '8 Shore Road',
        addressLocality: 'Whitby',
        addressRegion: 'North Yorkshire',
        postalCode: 'YO21 1YN',
        addressCountry: 'GB',
      },
      geo: {
        '@type': 'GeoCoordinates',
        latitude: 54.4863,
        longitude: -0.6133,
      },
    },
  },
  {
    id: 'organization',
    values: {
      name: 'Field Journal',
      url: 'https://example.com/',
      logo: 'https://example.com/images/logo.png',
      description: 'Independent coastal field research.',
      alternateName: 'FJ',
      sameAs:
        'https://social.example/field-journal\nhttps://video.example/field-journal',
      telephone: '+44 1947 000000',
      email: sampleEmail,
    },
    expected: {
      '@context': context,
      '@type': 'Organization',
      name: 'Field Journal',
      url: 'https://example.com/',
      logo: 'https://example.com/images/logo.png',
      description: 'Independent coastal field research.',
      alternateName: 'FJ',
      sameAs: [
        'https://social.example/field-journal',
        'https://video.example/field-journal',
      ],
      contactPoint: {
        '@type': 'ContactPoint',
        telephone: '+44 1947 000000',
        email: sampleEmail,
      },
    },
  },
  {
    id: 'person',
    values: {
      name: 'Sam Lee',
      alternateName: 'S. Lee',
      description: 'Coastal field researcher.',
      url: 'https://example.com/authors/sam-lee',
      image: 'https://example.com/images/sam-lee.jpg',
      jobTitle: 'Field researcher',
      worksFor: 'Field Journal',
      sameAs:
        'https://social.example/sam-lee\r\nhttps://profile.example/sam-lee',
    },
    expected: {
      '@context': context,
      '@type': 'Person',
      name: 'Sam Lee',
      alternateName: 'S. Lee',
      description: 'Coastal field researcher.',
      url: 'https://example.com/authors/sam-lee',
      image: 'https://example.com/images/sam-lee.jpg',
      jobTitle: 'Field researcher',
      worksFor: { '@type': 'Organization', name: 'Field Journal' },
      sameAs: [
        'https://social.example/sam-lee',
        'https://profile.example/sam-lee',
      ],
    },
  },
  {
    id: 'product',
    values: {
      name: 'Weatherproof field notebook',
      description: 'A pocket notebook for wet field conditions.',
      image: 'https://example.com/images/notebook.jpg',
      url: 'https://example.com/shop/notebook',
      sku: 'FIELD-NB-01',
      brand: 'Field Journal',
      price: '12.00',
      priceCurrency: 'GBP',
      availability: 'https://schema.org/InStock',
      ratingValue: '4.8',
      reviewCount: '46',
    },
    expected: {
      '@context': context,
      '@type': 'Product',
      name: 'Weatherproof field notebook',
      description: 'A pocket notebook for wet field conditions.',
      image: 'https://example.com/images/notebook.jpg',
      url: 'https://example.com/shop/notebook',
      sku: 'FIELD-NB-01',
      brand: { '@type': 'Brand', name: 'Field Journal' },
      offers: {
        '@type': 'Offer',
        price: '12.00',
        priceCurrency: 'GBP',
        availability: 'https://schema.org/InStock',
        url: 'https://example.com/shop/notebook',
      },
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: 4.8,
        reviewCount: 46,
      },
    },
  },
  {
    id: 'recipe',
    values: {
      name: 'Coastal oat bars',
      description: 'Portable oat bars for a day in the field.',
      image: 'https://example.com/images/oat-bars.jpg',
      authorName: 'Alex Smith',
      datePublished: '2026-08-02',
      prepMinutes: '15',
      cookMinutes: '30',
      recipeYield: '12 bars',
      ingredients: '200 g oats\n100 g dried fruit\n2 tbsp honey',
      instructions: 'Mix the ingredients.\nBake until golden.\nLeave to cool.',
    },
    expected: {
      '@context': context,
      '@type': 'Recipe',
      name: 'Coastal oat bars',
      description: 'Portable oat bars for a day in the field.',
      image: 'https://example.com/images/oat-bars.jpg',
      author: { '@type': 'Person', name: 'Alex Smith' },
      datePublished: '2026-08-02',
      prepTime: 'PT15M',
      cookTime: 'PT30M',
      totalTime: 'PT45M',
      recipeYield: '12 bars',
      recipeIngredient: ['200 g oats', '100 g dried fruit', '2 tbsp honey'],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Mix the ingredients.' },
        { '@type': 'HowToStep', text: 'Bake until golden.' },
        { '@type': 'HowToStep', text: 'Leave to cool.' },
      ],
    },
  },
  {
    id: 'review',
    values: {
      itemType: 'Book',
      itemName: 'A Coastal Field Guide',
      reviewName: 'A useful reference',
      reviewBody: 'Clear identification notes and practical maps.',
      authorName: 'Alex Smith',
      datePublished: '2026-08-10',
      ratingValue: '4',
      bestRating: '5',
      worstRating: '1',
    },
    expected: {
      '@context': context,
      '@type': 'Review',
      itemReviewed: {
        '@type': 'Book',
        name: 'A Coastal Field Guide',
      },
      name: 'A useful reference',
      reviewBody: 'Clear identification notes and practical maps.',
      author: { '@type': 'Person', name: 'Alex Smith' },
      datePublished: '2026-08-10',
      reviewRating: {
        '@type': 'Rating',
        ratingValue: 4,
        bestRating: 5,
        worstRating: 1,
      },
    },
  },
  {
    id: 'video',
    values: {
      name: 'How to record a shoreline survey',
      description: 'A walkthrough of a repeatable shoreline survey.',
      thumbnailUrl: 'https://example.com/images/survey-video.jpg',
      uploadDate: '2026-08-10T08:00:00+01:00',
      durationMinutes: '12',
      contentUrl: 'https://example.com/videos/shoreline-survey.mp4',
      embedUrl: 'https://example.com/videos/shoreline-survey/embed',
    },
    expected: {
      '@context': context,
      '@type': 'VideoObject',
      name: 'How to record a shoreline survey',
      description: 'A walkthrough of a repeatable shoreline survey.',
      thumbnailUrl: 'https://example.com/images/survey-video.jpg',
      uploadDate: '2026-08-10T08:00:00+01:00',
      duration: 'PT12M',
      contentUrl: 'https://example.com/videos/shoreline-survey.mp4',
      embedUrl: 'https://example.com/videos/shoreline-survey/embed',
    },
  },
  {
    id: 'website',
    values: {
      name: 'Field Journal',
      url: 'https://example.com/',
      alternateName: 'FJ\nexample.com',
    },
    expected: {
      '@context': context,
      '@type': 'WebSite',
      name: 'Field Journal',
      url: 'https://example.com/',
      alternateName: ['FJ', 'example.com'],
    },
  },
]

function validate(value: unknown) {
  return validateSchemaMarkup(JSON.stringify(value))
}

for (const fixture of generatorFixtures) {
  test(`generates and validates the complete ${fixture.id} fixture`, () => {
    const generated = generateSchemaMarkup(
      fixture.id,
      fixture.values,
      fixture.repeats,
    )

    assert.deepEqual(generated, fixture.expected)
    const report = validate(generated)
    assert.equal(report.dataStatus, 'complete')
    assert.equal(report.summary.entities, 1)
    assert.equal(report.summary.recognizedEntities, 1)
    assert.equal(report.summary.errors, 0)
    assert.equal(report.summary.warnings, 0)
  })
}

test('serializes script-closing text without ending the JSON-LD element', () => {
  const name = '</script><script>alert("schema")</script>'
  const script = schemaScript({
    '@context': context,
    '@type': 'Organization',
    name,
    url: 'https://example.com',
  })
  const serialized = script.slice(
    script.indexOf('\n') + 1,
    script.lastIndexOf('\n'),
  )

  assert.equal((script.match(/<\/script>/giu) || []).length, 1)
  assert.equal(JSON.parse(serialized).name, name)
})

test('rejects oversized input before parsing and marks capped findings partial', () => {
  const oversized = validateSchemaMarkup(
    'x'.repeat(SCHEMA_MARKUP_LIMITS.characters + 1),
  )
  assert.equal(oversized.dataStatus, 'partial')
  assert.equal(oversized.input.blocks, 0)
  assert.deepEqual(
    oversized.issues.map((issue) => issue.code),
    ['input-too-large'],
  )

  const noisy = validate({
    '@context': context,
    '@graph': Array.from({ length: 100 }, () => ({
      '@type': 'Organization',
    })),
  })
  assert.equal(noisy.dataStatus, 'partial')
  assert.equal(noisy.issues.length, SCHEMA_MARKUP_LIMITS.issues)
  assert.equal(noisy.issues.at(-1)?.code, 'issue-limit')
})
