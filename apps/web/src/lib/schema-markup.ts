export type SchemaField = {
  name: string
  label: string
  kind?:
    | 'text'
    | 'url'
    | 'textarea'
    | 'date'
    | 'datetime-local'
    | 'number'
    | 'select'
  placeholder?: string
  defaultValue?: string
  required?: boolean
  help?: string
  min?: number
  max?: number
  step?: number
  maxLength?: number
  options?: Array<{ value: string; label: string }>
}

export type SchemaRepeater = {
  name: string
  label: string
  addLabel: string
  minimum: number
  fields: SchemaField[]
}

export type SchemaGeneratorType = {
  id: string
  label: string
  schemaType: string
  description: string
  caveat?: string
  fields: SchemaField[]
  repeaters?: SchemaRepeater[]
}

const articleTypes = [
  { value: 'Article', label: 'Article' },
  { value: 'BlogPosting', label: 'Blog post' },
  { value: 'NewsArticle', label: 'News article' },
]

const availability = [
  { value: 'https://schema.org/InStock', label: 'In stock' },
  { value: 'https://schema.org/OutOfStock', label: 'Out of stock' },
  { value: 'https://schema.org/PreOrder', label: 'Preorder' },
  { value: 'https://schema.org/BackOrder', label: 'Back order' },
  { value: 'https://schema.org/Discontinued', label: 'Discontinued' },
]

const reviewedItemTypes = [
  { value: 'Book', label: 'Book' },
  { value: 'Course', label: 'Course' },
  { value: 'CreativeWorkSeason', label: 'Creative work season' },
  { value: 'CreativeWorkSeries', label: 'Creative work series' },
  { value: 'Episode', label: 'Episode' },
  { value: 'Event', label: 'Event' },
  { value: 'Game', label: 'Game' },
  { value: 'HowTo', label: 'How-to' },
  { value: 'LocalBusiness', label: 'Local business' },
  { value: 'MediaObject', label: 'Media object' },
  { value: 'Movie', label: 'Movie' },
  { value: 'MusicPlaylist', label: 'Music playlist' },
  { value: 'MusicRecording', label: 'Music recording' },
  { value: 'Organization', label: 'Organization' },
  { value: 'Product', label: 'Product' },
  { value: 'Recipe', label: 'Recipe' },
  { value: 'SoftwareApplication', label: 'Software application' },
]

export const SCHEMA_GENERATOR_TYPES: SchemaGeneratorType[] = [
  {
    id: 'aggregate-rating',
    label: 'Aggregate rating',
    schemaType: 'AggregateRating',
    description: 'Describe the average of ratings or reviews for one item.',
    caveat:
      'Show the same rating and counts on the page. Self-controlled LocalBusiness and Organization pages are not eligible for Google review stars.',
    fields: [
      {
        name: 'itemType',
        label: 'Reviewed item type',
        kind: 'select',
        required: true,
        options: reviewedItemTypes,
      },
      { name: 'itemName', label: 'Reviewed item name', required: true },
      {
        name: 'ratingValue',
        label: 'Average rating',
        kind: 'number',
        required: true,
        min: 0,
        step: 0.1,
      },
      {
        name: 'bestRating',
        label: 'Best possible rating',
        kind: 'number',
        required: true,
        defaultValue: '5',
        step: 0.1,
      },
      {
        name: 'worstRating',
        label: 'Worst possible rating',
        kind: 'number',
        required: true,
        defaultValue: '1',
        step: 0.1,
      },
      {
        name: 'ratingCount',
        label: 'Total rating count',
        kind: 'number',
        min: 1,
        step: 1,
        help: 'Add this or the review count.',
      },
      {
        name: 'reviewCount',
        label: 'Total review count',
        kind: 'number',
        min: 1,
        step: 1,
        help: 'Add this or the rating count.',
      },
    ],
  },
  {
    id: 'article',
    label: 'Article',
    schemaType: 'Article',
    description: 'Mark up an article, blog post, or news article.',
    fields: [
      {
        name: 'articleType',
        label: 'Article type',
        kind: 'select',
        required: true,
        options: articleTypes,
      },
      {
        name: 'url',
        label: 'Page URL',
        kind: 'url',
        placeholder: 'https://example.com/article',
      },
      { name: 'headline', label: 'Headline', required: true },
      { name: 'description', label: 'Description', kind: 'textarea' },
      { name: 'image', label: 'Image URL', kind: 'url', required: true },
      { name: 'authorName', label: 'Author name', required: true },
      { name: 'authorUrl', label: 'Author URL', kind: 'url' },
      { name: 'publisherName', label: 'Publisher name' },
      { name: 'publisherLogo', label: 'Publisher logo URL', kind: 'url' },
      {
        name: 'datePublished',
        label: 'Date published',
        kind: 'date',
        required: true,
      },
      { name: 'dateModified', label: 'Date modified', kind: 'date' },
    ],
  },
  {
    id: 'breadcrumb',
    label: 'Breadcrumb',
    schemaType: 'BreadcrumbList',
    description: 'Describe the page position in a site hierarchy.',
    fields: [],
    repeaters: [
      {
        name: 'items',
        label: 'Breadcrumb items',
        addLabel: 'Add breadcrumb',
        minimum: 2,
        fields: [
          { name: 'name', label: 'Name', required: true },
          { name: 'url', label: 'URL', kind: 'url', required: true },
        ],
      },
    ],
  },
  {
    id: 'event',
    label: 'Event',
    schemaType: 'Event',
    description: 'Describe an online or in-person event.',
    fields: [
      { name: 'name', label: 'Event name', required: true },
      { name: 'url', label: 'Event URL', kind: 'url' },
      { name: 'description', label: 'Description', kind: 'textarea' },
      { name: 'image', label: 'Image URL', kind: 'url' },
      {
        name: 'startDate',
        label: 'Start date and time',
        kind: 'datetime-local',
        required: true,
      },
      { name: 'endDate', label: 'End date and time', kind: 'datetime-local' },
      {
        name: 'attendanceMode',
        label: 'Attendance mode',
        kind: 'select',
        required: true,
        options: [
          {
            value: 'https://schema.org/OfflineEventAttendanceMode',
            label: 'In person',
          },
          {
            value: 'https://schema.org/OnlineEventAttendanceMode',
            label: 'Online',
          },
          {
            value: 'https://schema.org/MixedEventAttendanceMode',
            label: 'Mixed',
          },
        ],
      },
      { name: 'locationName', label: 'Venue name' },
      { name: 'locationUrl', label: 'Online event URL', kind: 'url' },
      { name: 'streetAddress', label: 'Street address' },
      { name: 'addressLocality', label: 'Town or city' },
      { name: 'addressRegion', label: 'Region' },
      { name: 'postalCode', label: 'Postal code' },
      { name: 'addressCountry', label: 'Country code', placeholder: 'US' },
      { name: 'offerUrl', label: 'Ticket URL', kind: 'url' },
      { name: 'price', label: 'Ticket price', kind: 'number' },
      { name: 'priceCurrency', label: 'Currency', placeholder: 'USD' },
    ],
  },
  {
    id: 'faq',
    label: 'FAQ page',
    schemaType: 'FAQPage',
    description: 'Create FAQPage markup from visible questions and answers.',
    caveat:
      'Google normally shows FAQ rich results only for authoritative government and health sites.',
    fields: [],
    repeaters: [
      {
        name: 'questions',
        label: 'Questions and answers',
        addLabel: 'Add question',
        minimum: 1,
        fields: [
          { name: 'question', label: 'Question', required: true },
          { name: 'answer', label: 'Answer', kind: 'textarea', required: true },
        ],
      },
    ],
  },
  {
    id: 'job-posting',
    label: 'Job posting',
    schemaType: 'JobPosting',
    description: 'Describe one job opening and its employer.',
    fields: [
      { name: 'title', label: 'Job title', required: true },
      {
        name: 'description',
        label: 'Job description',
        kind: 'textarea',
        required: true,
      },
      {
        name: 'datePosted',
        label: 'Date posted',
        kind: 'date',
        required: true,
      },
      { name: 'validThrough', label: 'Application deadline', kind: 'date' },
      {
        name: 'employmentType',
        label: 'Employment type',
        kind: 'select',
        options: [
          { value: 'FULL_TIME', label: 'Full time' },
          { value: 'PART_TIME', label: 'Part time' },
          { value: 'CONTRACTOR', label: 'Contractor' },
          { value: 'TEMPORARY', label: 'Temporary' },
          { value: 'INTERN', label: 'Intern' },
          { value: 'OTHER', label: 'Other' },
        ],
      },
      {
        name: 'organizationName',
        label: 'Hiring organization',
        required: true,
      },
      { name: 'organizationUrl', label: 'Organization URL', kind: 'url' },
      { name: 'organizationLogo', label: 'Organization logo URL', kind: 'url' },
      { name: 'streetAddress', label: 'Street address', required: true },
      { name: 'addressLocality', label: 'Town or city', required: true },
      { name: 'addressRegion', label: 'Region' },
      { name: 'postalCode', label: 'Postal code' },
      {
        name: 'addressCountry',
        label: 'Country code',
        required: true,
        placeholder: 'US',
      },
      { name: 'salaryMin', label: 'Minimum salary', kind: 'number' },
      { name: 'salaryMax', label: 'Maximum salary', kind: 'number' },
      { name: 'salaryCurrency', label: 'Salary currency', placeholder: 'USD' },
      {
        name: 'salaryUnit',
        label: 'Salary unit',
        kind: 'select',
        options: [
          { value: 'HOUR', label: 'Hour' },
          { value: 'DAY', label: 'Day' },
          { value: 'WEEK', label: 'Week' },
          { value: 'MONTH', label: 'Month' },
          { value: 'YEAR', label: 'Year' },
        ],
      },
    ],
  },
  {
    id: 'local-business',
    label: 'Local business',
    schemaType: 'LocalBusiness',
    description: 'Describe one physical business location.',
    fields: [
      {
        name: 'businessType',
        label: 'Business type',
        kind: 'select',
        required: true,
        options: [
          { value: 'LocalBusiness', label: 'Local business' },
          { value: 'Restaurant', label: 'Restaurant' },
          { value: 'Store', label: 'Store' },
          { value: 'ProfessionalService', label: 'Professional service' },
          { value: 'MedicalBusiness', label: 'Medical business' },
          { value: 'LodgingBusiness', label: 'Lodging business' },
        ],
      },
      { name: 'name', label: 'Business name', required: true },
      { name: 'url', label: 'Website URL', kind: 'url' },
      { name: 'image', label: 'Image URL', kind: 'url' },
      { name: 'telephone', label: 'Telephone' },
      { name: 'priceRange', label: 'Price range', placeholder: '$$' },
      { name: 'streetAddress', label: 'Street address', required: true },
      { name: 'addressLocality', label: 'Town or city', required: true },
      { name: 'addressRegion', label: 'Region' },
      { name: 'postalCode', label: 'Postal code' },
      {
        name: 'addressCountry',
        label: 'Country code',
        required: true,
        placeholder: 'US',
      },
      { name: 'latitude', label: 'Latitude', kind: 'number' },
      { name: 'longitude', label: 'Longitude', kind: 'number' },
    ],
  },
  {
    id: 'organization',
    label: 'Organization',
    schemaType: 'Organization',
    description: 'Describe an organization and its official identity.',
    fields: [
      { name: 'name', label: 'Organization name', required: true },
      { name: 'url', label: 'Website URL', kind: 'url', required: true },
      { name: 'logo', label: 'Logo URL', kind: 'url' },
      { name: 'description', label: 'Description', kind: 'textarea' },
      { name: 'alternateName', label: 'Alternate name' },
      {
        name: 'sameAs',
        label: 'Profile URLs',
        kind: 'textarea',
        help: 'Enter one public profile URL per line.',
      },
      { name: 'telephone', label: 'Telephone' },
      { name: 'email', label: 'Email address' },
    ],
  },
  {
    id: 'person',
    label: 'Person',
    schemaType: 'Person',
    description: 'Describe a public person profile and its official identity.',
    caveat:
      'Person markup describes an identity. It does not create a Google rich result on its own.',
    fields: [
      { name: 'name', label: 'Name', required: true },
      { name: 'alternateName', label: 'Alternate name' },
      { name: 'description', label: 'Description', kind: 'textarea' },
      { name: 'url', label: 'Profile or page URL', kind: 'url' },
      { name: 'image', label: 'Image URL', kind: 'url' },
      { name: 'jobTitle', label: 'Job title' },
      { name: 'worksFor', label: 'Organization' },
      {
        name: 'sameAs',
        label: 'Profile URLs',
        kind: 'textarea',
        help: 'Enter one official public profile URL per line.',
      },
    ],
  },
  {
    id: 'product',
    label: 'Product',
    schemaType: 'Product',
    description: 'Describe a product, offer, and genuine aggregate rating.',
    fields: [
      { name: 'name', label: 'Product name', required: true },
      { name: 'description', label: 'Description', kind: 'textarea' },
      { name: 'image', label: 'Image URL', kind: 'url' },
      { name: 'url', label: 'Product URL', kind: 'url' },
      { name: 'sku', label: 'SKU' },
      { name: 'brand', label: 'Brand' },
      { name: 'price', label: 'Price', kind: 'number', required: true },
      {
        name: 'priceCurrency',
        label: 'Currency',
        required: true,
        placeholder: 'USD',
      },
      {
        name: 'availability',
        label: 'Availability',
        kind: 'select',
        required: true,
        options: availability,
      },
      { name: 'ratingValue', label: 'Average rating', kind: 'number' },
      { name: 'reviewCount', label: 'Review count', kind: 'number' },
    ],
  },
  {
    id: 'recipe',
    label: 'Recipe',
    schemaType: 'Recipe',
    description: 'Describe a recipe, ingredients, and instructions.',
    fields: [
      { name: 'name', label: 'Recipe name', required: true },
      { name: 'description', label: 'Description', kind: 'textarea' },
      { name: 'image', label: 'Image URL', kind: 'url', required: true },
      { name: 'authorName', label: 'Author name' },
      { name: 'datePublished', label: 'Date published', kind: 'date' },
      { name: 'prepMinutes', label: 'Preparation minutes', kind: 'number' },
      { name: 'cookMinutes', label: 'Cooking minutes', kind: 'number' },
      { name: 'recipeYield', label: 'Yield', placeholder: '4 servings' },
      {
        name: 'ingredients',
        label: 'Ingredients',
        kind: 'textarea',
        required: true,
        help: 'Enter one ingredient per line.',
      },
      {
        name: 'instructions',
        label: 'Instructions',
        kind: 'textarea',
        required: true,
        help: 'Enter one step per line.',
      },
    ],
  },
  {
    id: 'review',
    label: 'Review',
    schemaType: 'Review',
    description: 'Describe one visible review of a specific item.',
    caveat:
      'Use a genuine review shown on the page. Self-controlled LocalBusiness and Organization reviews are not eligible for Google review stars.',
    fields: [
      {
        name: 'itemType',
        label: 'Reviewed item type',
        kind: 'select',
        required: true,
        options: reviewedItemTypes,
      },
      { name: 'itemName', label: 'Reviewed item name', required: true },
      { name: 'reviewName', label: 'Review title' },
      {
        name: 'reviewBody',
        label: 'Review text',
        kind: 'textarea',
        required: true,
      },
      {
        name: 'authorName',
        label: 'Reviewer name',
        required: true,
        maxLength: 99,
        help: 'Google requires a valid author name shorter than 100 characters.',
      },
      { name: 'datePublished', label: 'Date published', kind: 'date' },
      {
        name: 'ratingValue',
        label: 'Rating',
        kind: 'number',
        required: true,
        min: 0,
        step: 0.1,
      },
      {
        name: 'bestRating',
        label: 'Best possible rating',
        kind: 'number',
        required: true,
        defaultValue: '5',
        step: 0.1,
      },
      {
        name: 'worstRating',
        label: 'Worst possible rating',
        kind: 'number',
        required: true,
        defaultValue: '1',
        step: 0.1,
      },
    ],
  },
  {
    id: 'video',
    label: 'Video',
    schemaType: 'VideoObject',
    description: 'Describe a video and the page where it can be watched.',
    fields: [
      { name: 'name', label: 'Video name', required: true },
      {
        name: 'description',
        label: 'Description',
        kind: 'textarea',
        required: true,
      },
      {
        name: 'thumbnailUrl',
        label: 'Thumbnail URL',
        kind: 'url',
        required: true,
      },
      {
        name: 'uploadDate',
        label: 'Upload date',
        kind: 'date',
        required: true,
      },
      { name: 'durationMinutes', label: 'Duration in minutes', kind: 'number' },
      { name: 'contentUrl', label: 'Video file URL', kind: 'url' },
      { name: 'embedUrl', label: 'Embed URL', kind: 'url' },
    ],
  },
  {
    id: 'website',
    label: 'Website',
    schemaType: 'WebSite',
    description: 'State the preferred name for a domain or subdomain.',
    caveat:
      'Place this markup on the domain or subdomain home page. The URL must be that home page, not a subdirectory.',
    fields: [
      { name: 'name', label: 'Site name', required: true },
      {
        name: 'url',
        label: 'Home page URL',
        kind: 'url',
        required: true,
        placeholder: 'https://example.com/',
      },
      {
        name: 'alternateName',
        label: 'Alternate site names',
        kind: 'textarea',
        help: 'Enter one recognized alternate name per line, in preference order.',
      },
    ],
  },
]

type GeneratorValues = Record<string, string>
type GeneratorRepeats = Record<string, GeneratorValues[]>
type JsonObject = Record<string, unknown>

function clean(value: JsonObject): JsonObject {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) => {
      if (entry === '' || entry === undefined || entry === null) return []
      if (Array.isArray(entry)) {
        const items = entry.filter(
          (item) => item !== '' && item !== undefined && item !== null,
        )
        return items.length ? [[key, items]] : []
      }
      if (typeof entry === 'object') {
        const nested = clean(entry as JsonObject)
        return Object.keys(nested).length ? [[key, nested]] : []
      }
      return [[key, entry]]
    }),
  )
}

function lines(value = ''): string[] {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
}

function duration(minutes = ''): string | undefined {
  const value = Number(minutes)
  return Number.isFinite(value) && value > 0 ? `PT${value}M` : undefined
}

function numberValue(value = ''): number | undefined {
  const number = Number(value)
  return Number.isFinite(number) && value.trim() ? number : undefined
}

export function generateSchemaMarkup(
  type: string,
  values: GeneratorValues,
  repeats: GeneratorRepeats = {},
): JsonObject {
  const context = 'https://schema.org'
  let result: JsonObject

  if (type === 'aggregate-rating') {
    result = {
      '@context': context,
      '@type': 'AggregateRating',
      itemReviewed: clean({
        '@type': values.itemType,
        name: values.itemName,
      }),
      ratingValue: numberValue(values.ratingValue),
      bestRating: numberValue(values.bestRating),
      worstRating: numberValue(values.worstRating),
      ratingCount: numberValue(values.ratingCount),
      reviewCount: numberValue(values.reviewCount),
    }
  } else if (type === 'article') {
    result = {
      '@context': context,
      '@type': values.articleType || 'Article',
      mainEntityOfPage: values.url
        ? { '@type': 'WebPage', '@id': values.url }
        : undefined,
      headline: values.headline,
      description: values.description,
      image: values.image,
      author: values.authorName
        ? { '@type': 'Person', name: values.authorName, url: values.authorUrl }
        : undefined,
      publisher: values.publisherName
        ? {
            '@type': 'Organization',
            name: values.publisherName,
            logo: values.publisherLogo
              ? { '@type': 'ImageObject', url: values.publisherLogo }
              : undefined,
          }
        : undefined,
      datePublished: values.datePublished,
      dateModified: values.dateModified,
    }
  } else if (type === 'breadcrumb') {
    result = {
      '@context': context,
      '@type': 'BreadcrumbList',
      itemListElement: (repeats.items || []).map((item, index) =>
        clean({
          '@type': 'ListItem',
          position: index + 1,
          name: item.name,
          item: item.url,
        }),
      ),
    }
  } else if (type === 'event') {
    const online =
      values.attendanceMode?.includes('Online') ||
      values.attendanceMode?.includes('Mixed')
    const offline =
      values.attendanceMode?.includes('Offline') ||
      values.attendanceMode?.includes('Mixed')
    const hasPostalAddress = [
      values.streetAddress,
      values.addressLocality,
      values.addressRegion,
      values.postalCode,
      values.addressCountry,
    ].some(Boolean)
    const locations = [
      offline
        ? clean({
            '@type': 'Place',
            name: values.locationName,
            address: hasPostalAddress
              ? clean({
                  '@type': 'PostalAddress',
                  streetAddress: values.streetAddress,
                  addressLocality: values.addressLocality,
                  addressRegion: values.addressRegion,
                  postalCode: values.postalCode,
                  addressCountry: values.addressCountry,
                })
              : undefined,
          })
        : undefined,
      online && values.locationUrl
        ? { '@type': 'VirtualLocation', url: values.locationUrl }
        : undefined,
    ].filter(Boolean)
    result = {
      '@context': context,
      '@type': 'Event',
      name: values.name,
      url: values.url,
      description: values.description,
      image: values.image,
      startDate: values.startDate,
      endDate: values.endDate,
      eventAttendanceMode: values.attendanceMode,
      eventStatus: 'https://schema.org/EventScheduled',
      location: locations.length === 1 ? locations[0] : locations,
      offers:
        values.offerUrl || values.price
          ? clean({
              '@type': 'Offer',
              url: values.offerUrl,
              price: values.price,
              priceCurrency: values.priceCurrency,
              availability: 'https://schema.org/InStock',
            })
          : undefined,
    }
  } else if (type === 'faq') {
    result = {
      '@context': context,
      '@type': 'FAQPage',
      mainEntity: (repeats.questions || []).map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    }
  } else if (type === 'job-posting') {
    result = {
      '@context': context,
      '@type': 'JobPosting',
      title: values.title,
      description: values.description,
      datePosted: values.datePosted,
      validThrough: values.validThrough,
      employmentType: values.employmentType,
      hiringOrganization: clean({
        '@type': 'Organization',
        name: values.organizationName,
        sameAs: values.organizationUrl,
        logo: values.organizationLogo,
      }),
      jobLocation: clean({
        '@type': 'Place',
        address: clean({
          '@type': 'PostalAddress',
          streetAddress: values.streetAddress,
          addressLocality: values.addressLocality,
          addressRegion: values.addressRegion,
          postalCode: values.postalCode,
          addressCountry: values.addressCountry,
        }),
      }),
      baseSalary:
        values.salaryMin || values.salaryMax
          ? clean({
              '@type': 'MonetaryAmount',
              currency: values.salaryCurrency,
              value: clean({
                '@type': 'QuantitativeValue',
                minValue: values.salaryMin,
                maxValue: values.salaryMax,
                unitText: values.salaryUnit,
              }),
            })
          : undefined,
    }
  } else if (type === 'local-business') {
    result = {
      '@context': context,
      '@type': values.businessType || 'LocalBusiness',
      name: values.name,
      url: values.url,
      image: values.image,
      telephone: values.telephone,
      priceRange: values.priceRange,
      address: clean({
        '@type': 'PostalAddress',
        streetAddress: values.streetAddress,
        addressLocality: values.addressLocality,
        addressRegion: values.addressRegion,
        postalCode: values.postalCode,
        addressCountry: values.addressCountry,
      }),
      geo:
        values.latitude && values.longitude
          ? {
              '@type': 'GeoCoordinates',
              latitude: Number(values.latitude),
              longitude: Number(values.longitude),
            }
          : undefined,
    }
  } else if (type === 'organization') {
    result = {
      '@context': context,
      '@type': 'Organization',
      name: values.name,
      url: values.url,
      logo: values.logo,
      description: values.description,
      alternateName: values.alternateName,
      sameAs: lines(values.sameAs),
      contactPoint:
        values.telephone || values.email
          ? clean({
              '@type': 'ContactPoint',
              telephone: values.telephone,
              email: values.email,
            })
          : undefined,
    }
  } else if (type === 'person') {
    result = {
      '@context': context,
      '@type': 'Person',
      name: values.name,
      alternateName: values.alternateName,
      description: values.description,
      url: values.url,
      image: values.image,
      jobTitle: values.jobTitle,
      worksFor: values.worksFor
        ? { '@type': 'Organization', name: values.worksFor }
        : undefined,
      sameAs: lines(values.sameAs),
    }
  } else if (type === 'product') {
    result = {
      '@context': context,
      '@type': 'Product',
      name: values.name,
      description: values.description,
      image: values.image,
      url: values.url,
      sku: values.sku,
      brand: values.brand
        ? { '@type': 'Brand', name: values.brand }
        : undefined,
      offers: clean({
        '@type': 'Offer',
        price: values.price,
        priceCurrency: values.priceCurrency,
        availability: values.availability,
        url: values.url,
      }),
      aggregateRating:
        values.ratingValue && values.reviewCount
          ? {
              '@type': 'AggregateRating',
              ratingValue: Number(values.ratingValue),
              reviewCount: Number(values.reviewCount),
            }
          : undefined,
    }
  } else if (type === 'recipe') {
    result = {
      '@context': context,
      '@type': 'Recipe',
      name: values.name,
      description: values.description,
      image: values.image,
      author: values.authorName
        ? { '@type': 'Person', name: values.authorName }
        : undefined,
      datePublished: values.datePublished,
      prepTime: duration(values.prepMinutes),
      cookTime: duration(values.cookMinutes),
      totalTime: duration(
        String(
          (Number(values.prepMinutes) || 0) + (Number(values.cookMinutes) || 0),
        ),
      ),
      recipeYield: values.recipeYield,
      recipeIngredient: lines(values.ingredients),
      recipeInstructions: lines(values.instructions).map((text) => ({
        '@type': 'HowToStep',
        text,
      })),
    }
  } else if (type === 'review') {
    result = {
      '@context': context,
      '@type': 'Review',
      itemReviewed: clean({
        '@type': values.itemType,
        name: values.itemName,
      }),
      name: values.reviewName,
      reviewBody: values.reviewBody,
      author: clean({ '@type': 'Person', name: values.authorName }),
      datePublished: values.datePublished,
      reviewRating: clean({
        '@type': 'Rating',
        ratingValue: numberValue(values.ratingValue),
        bestRating: numberValue(values.bestRating),
        worstRating: numberValue(values.worstRating),
      }),
    }
  } else if (type === 'video') {
    result = {
      '@context': context,
      '@type': 'VideoObject',
      name: values.name,
      description: values.description,
      thumbnailUrl: values.thumbnailUrl,
      uploadDate: values.uploadDate,
      duration: duration(values.durationMinutes),
      contentUrl: values.contentUrl,
      embedUrl: values.embedUrl,
    }
  } else if (type === 'website') {
    result = {
      '@context': context,
      '@type': 'WebSite',
      name: values.name,
      url: values.url,
      alternateName: lines(values.alternateName),
    }
  } else {
    throw new Error(`Unknown schema generator type: ${type}`)
  }

  return clean(result)
}

export function schemaScript(json: JsonObject): string {
  const serialized = JSON.stringify(json, null, 2).replace(/</gu, '\\u003c')
  return `<script type="application/ld+json">\n${serialized}\n</script>`
}

export type {
  SchemaValidationIssue,
  SchemaValidationReport,
} from './schema-markup-validator.ts'
export {
  SCHEMA_MARKUP_LIMITS,
  validateSchemaMarkup,
} from './schema-markup-validator.ts'
