import assert from 'node:assert/strict'
import test from 'node:test'
import {
  generateSchemaMarkup,
  SCHEMA_GENERATOR_TYPES,
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

test('offers exactly the fourteen supported generator types', () => {
  assert.deepEqual(
    SCHEMA_GENERATOR_TYPES.map((type) => type.id),
    generatorFixtures.map((fixture) => fixture.id),
  )
})

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

test('supports every article profile through the article generator', () => {
  const fixture = generatorFixtures.find((item) => item.id === 'article')
  assert.ok(fixture)

  for (const articleType of ['Article', 'BlogPosting', 'NewsArticle']) {
    const generated = generateSchemaMarkup('article', {
      ...fixture.values,
      articleType,
    })
    const report = validate(generated)
    assert.equal(generated['@type'], articleType)
    assert.equal(report.summary.recognizedEntities, 1)
    assert.equal(report.summary.errors, 0)
  }
})

test('removes empty optional fields, objects, and arrays', () => {
  const generated = generateSchemaMarkup('article', {
    articleType: 'Article',
    headline: 'A concise field note',
    image: 'https://example.com/note.jpg',
    authorName: 'Sam Lee',
    datePublished: '2026-08-10',
    publisherName: '',
    description: '',
  })

  assert.deepEqual(generated, {
    '@context': context,
    '@type': 'Article',
    headline: 'A concise field note',
    image: 'https://example.com/note.jpg',
    author: { '@type': 'Person', name: 'Sam Lee' },
    datePublished: '2026-08-10',
  })
})

test('omits unavailable optional structures across generator types', () => {
  assert.deepEqual(generateSchemaMarkup('aggregate-rating', {}), {
    '@context': context,
    '@type': 'AggregateRating',
  })
  assert.deepEqual(generateSchemaMarkup('event', { attendanceMode: '' }), {
    '@context': context,
    '@type': 'Event',
    eventStatus: 'https://schema.org/EventScheduled',
  })
  assert.deepEqual(
    generateSchemaMarkup('event', {
      attendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
      locationUrl: 'https://example.com/live',
    }).location,
    { '@type': 'VirtualLocation', url: 'https://example.com/live' },
  )
  assert.deepEqual(
    generateSchemaMarkup('event', {
      attendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      locationName: 'Harbour Hall',
    }).location,
    { '@type': 'Place', name: 'Harbour Hall' },
  )
  assert.equal('baseSalary' in generateSchemaMarkup('job-posting', {}), false)
  assert.equal('geo' in generateSchemaMarkup('local-business', {}), false)
  assert.equal(
    'contactPoint' in generateSchemaMarkup('organization', {}),
    false,
  )
  assert.equal('worksFor' in generateSchemaMarkup('person', {}), false)
  const product = generateSchemaMarkup('product', {})
  assert.equal('brand' in product, false)
  assert.equal('aggregateRating' in product, false)
  const recipe = generateSchemaMarkup('recipe', {
    prepMinutes: 'not-a-number',
    cookMinutes: '0',
  })
  assert.equal('prepTime' in recipe, false)
  assert.equal('cookTime' in recipe, false)
  assert.equal('totalTime' in recipe, false)
  assert.equal(
    'duration' in generateSchemaMarkup('video', { durationMinutes: '-1' }),
    false,
  )
  assert.equal('alternateName' in generateSchemaMarkup('website', {}), false)
})

test('rejects an unknown generator type', () => {
  assert.throws(
    () => generateSchemaMarkup('dataset', {}),
    /Unknown schema generator type: dataset/u,
  )
})

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

test('extracts JSON-LD from HTML and counts multiple supported entities', () => {
  const report = validateSchemaMarkup(`<!doctype html>
    <script nonce="abc" type='application/ld+json'>
      {"@context":"https://schema.org","@type":"Organization","name":"Field Journal","url":"https://example.com","logo":"https://example.com/logo.png","sameAs":["https://social.example/field-journal"]}
    </script>
    <script TYPE="application/ld+json" data-source="page">
      {"@context":"https://schema.org","@type":"Person","name":"Sam Lee","url":"https://example.com/sam","sameAs":["https://social.example/sam"]}
    </script>`)

  assert.equal(report.input.format, 'html')
  assert.equal(report.input.blocks, 2)
  assert.equal(report.summary.entities, 2)
  assert.equal(report.summary.recognizedEntities, 2)
  assert.deepEqual(report.entityTypes, [
    { type: 'Organization', count: 1 },
    { type: 'Person', count: 1 },
  ])
})

test('accepts a BOM, a top-level array, and array-valued entity types', () => {
  const report = validateSchemaMarkup(
    `\uFEFF${JSON.stringify([
      {
        '@context': 'http://schema.org',
        '@type': ['Product', 'Thing'],
        name: 'Field notebook',
        offers: {
          price: '12.00',
          priceCurrency: 'GBP',
          availability: 'https://schema.org/InStock',
        },
        image: 'https://example.com/notebook.jpg',
        description: 'A notebook.',
        brand: 'Field Journal',
      },
    ])}`,
  )

  assert.equal(report.input.format, 'json')
  assert.equal(report.summary.recognizedEntities, 1)
  assert.deepEqual(report.entityTypes, [
    { type: 'Product', count: 1 },
    { type: 'Thing', count: 1 },
  ])
  assert.equal(report.summary.errors, 0)
})

test('reports absent JSON-LD, missing types, and malformed JSON distinctly', () => {
  const absent = validateSchemaMarkup('<html><body>No markup</body></html>')
  assert.equal(absent.input.format, 'unknown')
  assert.deepEqual(
    absent.issues.map((issue) => issue.code),
    ['no-json-ld'],
  )

  const missingType = validateSchemaMarkup(
    '[{"@context":"https://schema.org"}]',
  )
  assert.ok(missingType.issues.some((issue) => issue.code === 'missing-type'))

  const malformed = validateSchemaMarkup(
    '{\n"@context":"https://schema.org",\n"@type":"Organization",\n}',
  )
  assert.equal(malformed.issues[0]?.code, 'invalid-json')
  assert.equal(malformed.issues[0]?.line, 4)
})

test('keeps unsupported profiles separate from syntax failures', () => {
  const report = validate({
    '@context': context,
    '@type': 'Dataset',
    name: 'Survey observations',
  })

  assert.equal(report.valid, true)
  assert.equal(report.summary.recognizedEntities, 0)
  assert.ok(report.issues.some((issue) => issue.code === 'unsupported-profile'))
})

test('inherits graph context and reports missing or unexpected contexts', () => {
  const inherited = validate({
    '@context': context,
    '@graph': [
      {
        '@type': 'Organization',
        name: 'Field Journal',
        url: 'https://example.com',
        logo: 'https://example.com/logo.png',
        sameAs: ['https://social.example/field-journal'],
      },
    ],
  })
  assert.equal(
    inherited.issues.some((issue) => issue.code === 'missing-context'),
    false,
  )

  const missing = validate({
    '@type': 'Organization',
    name: 'Field Journal',
    url: 'https://example.com',
  })
  assert.ok(missing.issues.some((issue) => issue.code === 'missing-context'))

  const unexpected = validate({
    '@context': 'https://example.com/vocabulary',
    '@type': 'Organization',
    name: 'Field Journal',
    url: 'https://example.com',
  })
  assert.ok(
    unexpected.issues.some((issue) => issue.code === 'unexpected-context'),
  )
})

test('validates every supported local business alias', () => {
  for (const type of [
    'Restaurant',
    'Store',
    'ProfessionalService',
    'MedicalBusiness',
    'LodgingBusiness',
  ]) {
    const report = validate({
      '@context': context,
      '@type': type,
      name: 'Harbour Field Supplies',
      url: 'https://example.com/shop',
      telephone: '+44 1947 000000',
      image: 'https://example.com/shop.jpg',
      address: {
        '@type': 'PostalAddress',
        streetAddress: '8 Shore Road',
        addressLocality: 'Whitby',
        addressCountry: 'GB',
      },
    })
    assert.equal(report.summary.recognizedEntities, 1)
    assert.equal(report.summary.errors, 0)
  }
})

test('finds incomplete FAQ questions and breadcrumb items', () => {
  const faq = validate({
    '@context': context,
    '@type': 'FAQPage',
    mainEntity: [{ '@type': 'Question', name: 'What should I bring?' }],
  })
  assert.ok(faq.issues.some((issue) => issue.code === 'incomplete-question'))

  const breadcrumb = validate({
    '@context': context,
    '@type': 'BreadcrumbList',
    itemListElement: [{ '@type': 'ListItem', position: 1 }],
  })
  assert.ok(
    breadcrumb.issues.some((issue) => issue.code === 'incomplete-breadcrumb'),
  )
})

test('requires an event location with usable place or URL evidence', () => {
  const report = validate({
    '@context': context,
    '@type': 'Event',
    name: 'Coastal field workshop',
    startDate: '2026-09-12T09:00:00+01:00',
    location: [{ '@type': 'Place' }, { '@type': 'VirtualLocation' }],
  })

  assert.ok(report.issues.some((issue) => issue.code === 'incomplete-location'))
})

test('checks rating scales, counts, and review author limits', () => {
  const invalidScale = validate({
    '@context': context,
    '@type': 'AggregateRating',
    itemReviewed: { '@type': 'Product', name: 'Field notebook' },
    ratingValue: 4,
    bestRating: 1,
    worstRating: 5,
    ratingCount: 1,
  })
  assert.ok(
    invalidScale.issues.some((issue) => issue.code === 'invalid-rating-scale'),
  )

  const invalidCounts = validate({
    '@context': context,
    '@type': 'AggregateRating',
    itemReviewed: { '@type': 'Product', name: 'Field notebook' },
    ratingValue: '6',
    bestRating: '5',
    worstRating: '1',
    ratingCount: 0,
    reviewCount: 1.5,
  })
  assert.ok(
    invalidCounts.issues.some((issue) => issue.code === 'rating-out-of-range'),
  )
  assert.equal(
    invalidCounts.issues.filter(
      (issue) => issue.code === 'invalid-rating-count',
    ).length,
    2,
  )

  const missingCounts = validate({
    '@context': context,
    '@type': 'AggregateRating',
    itemReviewed: { '@type': 'Product', name: 'Field notebook' },
    ratingValue: 4,
  })
  assert.ok(
    missingCounts.issues.some((issue) => issue.code === 'missing-rating-count'),
  )

  const longAuthor = validate({
    '@context': context,
    '@type': 'Review',
    itemReviewed: { '@type': 'Book', name: 'A Coastal Field Guide' },
    author: { '@type': 'Person', name: 'A'.repeat(100) },
    reviewRating: { '@type': 'Rating', ratingValue: 4 },
  })
  assert.ok(
    longAuthor.issues.some((issue) => issue.code === 'review-author-too-long'),
  )
})

test('requires WebSite markup to use an absolute home-page URL', () => {
  const subdirectory = validate({
    '@context': context,
    '@type': 'WebSite',
    name: 'Field Journal',
    url: 'https://example.com/journal?edition=summer#latest',
  })
  assert.ok(
    subdirectory.issues.some(
      (issue) => issue.code === 'website-url-not-homepage',
    ),
  )

  for (const url of ['field-journal.example', 'ftp://example.com/']) {
    const invalid = validate({
      '@context': context,
      '@type': 'WebSite',
      name: 'Field Journal',
      url,
    })
    assert.ok(
      invalid.issues.some((issue) => issue.code === 'invalid-website-url'),
    )
  }
})

test('accepts the exact JSON-LD block limit and caps the next block', () => {
  const block = `<script type="application/ld+json">${JSON.stringify({
    '@context': context,
    '@type': 'Person',
    name: 'Sam Lee',
    url: 'https://example.com/sam',
    sameAs: ['https://social.example/sam'],
  })}</script>`
  const exact = validateSchemaMarkup(block.repeat(SCHEMA_MARKUP_LIMITS.blocks))
  assert.equal(exact.dataStatus, 'complete')
  assert.equal(exact.input.blocks, SCHEMA_MARKUP_LIMITS.blocks)
  assert.equal(exact.summary.entities, SCHEMA_MARKUP_LIMITS.blocks)

  const capped = validateSchemaMarkup(
    block.repeat(SCHEMA_MARKUP_LIMITS.blocks + 1),
  )
  assert.equal(capped.dataStatus, 'partial')
  assert.equal(capped.input.blocks, SCHEMA_MARKUP_LIMITS.blocks)
  assert.equal(capped.summary.entities, SCHEMA_MARKUP_LIMITS.blocks)
  assert.ok(capped.issues.some((issue) => issue.code === 'block-limit'))
})

test('accepts the exact entity limit and caps only additional entities', () => {
  const entity = {
    '@type': 'Organization',
    name: 'Field Journal',
    url: 'https://example.com/',
    logo: 'https://example.com/logo.png',
    sameAs: ['https://social.example/field-journal'],
  }
  const graph = (count: number) => ({
    '@context': context,
    '@graph': Array.from({ length: count }, () => entity),
  })

  const exact = validate(graph(SCHEMA_MARKUP_LIMITS.entities))
  assert.equal(exact.dataStatus, 'complete')
  assert.equal(exact.summary.entities, SCHEMA_MARKUP_LIMITS.entities)
  assert.equal(
    exact.issues.some((issue) => issue.code === 'entity-limit'),
    false,
  )

  const capped = validate(graph(SCHEMA_MARKUP_LIMITS.entities + 1))
  assert.equal(capped.dataStatus, 'partial')
  assert.equal(capped.summary.entities, SCHEMA_MARKUP_LIMITS.entities)
  assert.ok(capped.issues.some((issue) => issue.code === 'entity-limit'))
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
