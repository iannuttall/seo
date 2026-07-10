import type {
  GoogleRichResultAssessment,
  GoogleRichResultAssessmentSelection,
  GoogleRichResultAssessmentStatus,
} from '../types.js'

type SupportedType = GoogleRichResultAssessment['schemaType']

const SUPPORTED_TYPES = new Set<SupportedType>([
  'Article',
  'BlogPosting',
  'NewsArticle',
  'Product',
  'BreadcrumbList',
  'FAQPage',
])

const ASSESSMENT_STATUSES = [
  'no-required-properties',
  'required-properties-observed',
  'missing-required-properties',
  'retired',
  'not-assessed',
] as const satisfies readonly GoogleRichResultAssessmentStatus[]

export const GOOGLE_RICH_RESULT_ASSESSMENT_LIMIT = 50

function isSupportedType(value: string): value is SupportedType {
  return SUPPORTED_TYPES.has(value as SupportedType)
}

const ARTICLE_DOC =
  'https://developers.google.com/search/docs/appearance/structured-data/article'
const PRODUCT_DOC =
  'https://developers.google.com/search/docs/appearance/structured-data/product-snippet'
const BREADCRUMB_DOC =
  'https://developers.google.com/search/docs/appearance/structured-data/breadcrumb'
const FAQ_DOC =
  'https://developers.google.com/search/updates#removing-faq-rich-result'

function hasValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.some(hasValue)
  return Boolean(
    value &&
      typeof value === 'object' &&
      Object.values(value as Record<string, unknown>).some(hasValue),
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function schemaTypeName(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('schema:')) return trimmed.slice('schema:'.length)
  try {
    const url = new URL(trimmed)
    if (url.hostname.replace(/^www\./, '').toLowerCase() === 'schema.org') {
      return decodeURIComponent(url.pathname.replace(/^\/+/, ''))
    }
  } catch {
    // A compact Schema.org type is expected in the common case.
  }
  return trimmed
}

function hasSchemaType(
  record: Record<string, unknown>,
  expected: string[],
): boolean {
  const values = Array.isArray(record['@type'])
    ? record['@type']
    : [record['@type']]
  return values.some(
    (value) =>
      typeof value === 'string' && expected.includes(schemaTypeName(value)),
  )
}

function hasTypedObject(
  value: unknown,
  predicate: (record: Record<string, unknown>) => boolean,
): boolean {
  return (Array.isArray(value) ? value : [value]).some(
    (item) => isRecord(item) && predicate(item),
  )
}

function isFiniteNumericValue(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value)
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    Number.isFinite(Number(value))
  )
}

function isPositiveInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isRatingValue(value: unknown): boolean {
  if (isFiniteNumericValue(value)) return true
  if (typeof value !== 'string') return false
  return /^(?:\d+(?:\.\d+)?\s*%|\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?)$/.test(
    value.trim(),
  )
}

function isNamedReviewAuthor(value: unknown): boolean {
  return hasTypedObject(
    value,
    (author) =>
      hasSchemaType(author, ['Person', 'Organization']) &&
      isNonEmptyText(author.name) &&
      author.name.trim().length < 100,
  )
}

function isRating(value: unknown): boolean {
  return hasTypedObject(
    value,
    (rating) =>
      hasSchemaType(rating, ['Rating', 'AggregateRating']) &&
      isRatingValue(rating.ratingValue),
  )
}

function isReview(value: unknown): boolean {
  return hasTypedObject(
    value,
    (review) =>
      hasSchemaType(review, ['Review']) &&
      isNamedReviewAuthor(review.author) &&
      isRating(review.reviewRating),
  )
}

function isAggregateRating(value: unknown): boolean {
  return hasTypedObject(
    value,
    (rating) =>
      hasSchemaType(rating, ['AggregateRating']) &&
      isRatingValue(rating.ratingValue) &&
      [rating.ratingCount, rating.reviewCount].some(isPositiveInteger),
  )
}

function isPriceSpecification(value: unknown): boolean {
  return hasTypedObject(
    value,
    (specification) =>
      hasSchemaType(specification, [
        'PriceSpecification',
        'UnitPriceSpecification',
      ]) && isFiniteNumericValue(specification.price),
  )
}

function isOffer(value: unknown): boolean {
  return hasTypedObject(value, (offer) => {
    if (hasSchemaType(offer, ['Offer'])) {
      return (
        isFiniteNumericValue(offer.price) ||
        isPriceSpecification(offer.priceSpecification)
      )
    }
    if (hasSchemaType(offer, ['AggregateOffer'])) {
      return (
        isFiniteNumericValue(offer.lowPrice) &&
        isNonEmptyText(offer.priceCurrency)
      )
    }
    return false
  })
}

function isUrlReference(value: unknown): value is string {
  if (!isNonEmptyText(value) || /\s/.test(value)) return false
  try {
    const url = new URL(value, 'https://example.invalid/')
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isBreadcrumbTarget(value: unknown): boolean {
  if (isUrlReference(value)) return true
  return isRecord(value) && isUrlReference(value['@id'])
}

function observedProperties(record: Record<string, unknown>): string[] {
  return Object.keys(record)
    .filter((key) => !key.startsWith('@') && hasValue(record[key]))
    .sort()
}

function baseAssessment(
  input: {
    block: number
    path: string
    schemaType: SupportedType
  },
  feature: GoogleRichResultAssessment['feature'],
  record: Record<string, unknown>,
  documentationUrl: string,
): Omit<
  GoogleRichResultAssessment,
  'status' | 'missingRequiredProperties' | 'limitations'
> {
  return {
    format: 'json-ld',
    block: input.block,
    path: input.path,
    schemaType: input.schemaType,
    feature,
    observedProperties: observedProperties(record),
    documentationUrl,
  }
}

function productAssessment(
  input: { block: number; path: string; schemaType: 'Product' },
  record: Record<string, unknown>,
): GoogleRichResultAssessment {
  const missing: string[] = []
  if (!isNonEmptyText(record.name)) missing.push('name')
  if (
    ![
      isReview(record.review),
      isAggregateRating(record.aggregateRating),
      isOffer(record.offers),
    ].some(Boolean)
  ) {
    missing.push('one of review, aggregateRating, or offers')
  }
  return {
    ...baseAssessment(input, 'product-snippet', record, PRODUCT_DOC),
    status: missing.length
      ? 'missing-required-properties'
      : 'required-properties-observed',
    missingRequiredProperties: missing,
    limitations: [
      'This checks documented Product name and minimal nested Review, AggregateRating, Offer, or AggregateOffer value shapes. Recommended properties, value ranges, and feature-specific policy requirements are not fully validated.',
      'Visible-content parity, crawlability, Search policies, and actual rich-result eligibility require Google validation.',
    ],
  }
}

function breadcrumbAssessment(
  input: { block: number; path: string; schemaType: 'BreadcrumbList' },
  record: Record<string, unknown>,
): GoogleRichResultAssessment {
  const rawItems = record.itemListElement
  const items = Array.isArray(rawItems) ? rawItems : []
  const missing: string[] = []
  if (items.length < 2) {
    missing.push('itemListElement with at least two ListItem values')
  }
  items.forEach((value, index) => {
    if (!isRecord(value)) {
      missing.push(`itemListElement[${index}] ListItem object`)
      return
    }
    const item = value
    if (!hasSchemaType(item, ['ListItem'])) {
      missing.push(`itemListElement[${index}].@type ListItem`)
    }
    if (!isPositiveInteger(item.position)) {
      missing.push(`itemListElement[${index}].position`)
    }
    const target = item.item
    const targetName = isRecord(target) ? target.name : undefined
    if (!isNonEmptyText(item.name) && !isNonEmptyText(targetName)) {
      missing.push(`itemListElement[${index}].name`)
    }
    if (
      (index < items.length - 1 || target !== undefined) &&
      !isBreadcrumbTarget(target)
    ) {
      missing.push(`itemListElement[${index}].item`)
    }
  })
  return {
    ...baseAssessment(input, 'breadcrumb', record, BREADCRUMB_DOC),
    status: missing.length
      ? 'missing-required-properties'
      : 'required-properties-observed',
    missingRequiredProperties: missing,
    limitations: [
      'This checks ListItem typing, positive integer positions, non-empty names, and URL or @id target shapes. Visible breadcrumb parity, target crawlability, and Search policies are not verified.',
      'Observed properties do not guarantee that Google will show a breadcrumb rich result.',
    ],
  }
}

function articleAssessment(
  input: {
    block: number
    path: string
    schemaType: 'Article' | 'BlogPosting' | 'NewsArticle'
  },
  record: Record<string, unknown>,
): GoogleRichResultAssessment {
  return {
    ...baseAssessment(input, 'article', record, ARTICLE_DOC),
    status: 'no-required-properties',
    missingRequiredProperties: [],
    limitations: [
      'Google currently lists no required Article properties; author, dates, headline, and image are recommended where applicable.',
      'Visible-content parity, image crawlability, Search policies, and actual appearance are not verified.',
    ],
  }
}

function faqAssessment(
  input: { block: number; path: string; schemaType: 'FAQPage' },
  record: Record<string, unknown>,
): GoogleRichResultAssessment {
  return {
    ...baseAssessment(input, 'faq', record, FAQ_DOC),
    status: 'retired',
    missingRequiredProperties: [],
    limitations: [
      'Google says the FAQ rich-result feature stopped appearing in Search on May 7, 2026 and removed its documentation in June 2026.',
      'FAQPage can remain machine-readable Schema.org markup, but it is not a current Google rich-result opportunity.',
    ],
  }
}

export function assessGoogleRichResults(input: {
  block: number
  path: string
  nodeTypes: string[]
  record: Record<string, unknown>
}): GoogleRichResultAssessment[] {
  return input.nodeTypes.flatMap((schemaType) => {
    if (schemaType === 'Product') {
      return [productAssessment({ ...input, schemaType }, input.record)]
    }
    if (schemaType === 'BreadcrumbList') {
      return [breadcrumbAssessment({ ...input, schemaType }, input.record)]
    }
    if (
      schemaType === 'Article' ||
      schemaType === 'BlogPosting' ||
      schemaType === 'NewsArticle'
    ) {
      return [articleAssessment({ ...input, schemaType }, input.record)]
    }
    if (schemaType === 'FAQPage') {
      return [faqAssessment({ ...input, schemaType }, input.record)]
    }
    return []
  })
}

export function unassessedGoogleRichResult(input: {
  format: 'microdata' | 'rdfa'
  schemaType: string
}): GoogleRichResultAssessment[] {
  if (!isSupportedType(input.schemaType)) return []
  const schemaType = input.schemaType
  const metadata = (() => {
    if (schemaType === 'Product') {
      return {
        feature: 'product-snippet' as const,
        documentationUrl: PRODUCT_DOC,
      }
    }
    if (schemaType === 'BreadcrumbList') {
      return {
        feature: 'breadcrumb' as const,
        documentationUrl: BREADCRUMB_DOC,
      }
    }
    if (
      schemaType === 'Article' ||
      schemaType === 'BlogPosting' ||
      schemaType === 'NewsArticle'
    ) {
      return { feature: 'article' as const, documentationUrl: ARTICLE_DOC }
    }
    if (schemaType === 'FAQPage') {
      return { feature: 'faq' as const, documentationUrl: FAQ_DOC }
    }
    return undefined
  })()
  if (!metadata) return []
  return [
    {
      format: input.format,
      path: `${input.format}:${schemaType}`,
      schemaType,
      feature: metadata.feature,
      status: 'not-assessed',
      observedProperties: [],
      missingRequiredProperties: [],
      limitations: [
        `${input.format} type evidence was detected, but property-level extraction is not available for this format.`,
        'No rich-result completeness or eligibility conclusion was made.',
      ],
      documentationUrl: metadata.documentationUrl,
    },
  ]
}

function emptyStatusCounts(): Record<GoogleRichResultAssessmentStatus, number> {
  return Object.fromEntries(
    ASSESSMENT_STATUSES.map((status) => [status, 0]),
  ) as Record<GoogleRichResultAssessmentStatus, number>
}

function statusCounts(
  assessments: GoogleRichResultAssessment[],
): Record<GoogleRichResultAssessmentStatus, number> {
  const counts = emptyStatusCounts()
  for (const assessment of assessments) counts[assessment.status] += 1
  return counts
}

function compareCodepoints(left: string, right: string): number {
  if (left === right) return 0
  return left < right ? -1 : 1
}

function assessmentSortKey(assessment: GoogleRichResultAssessment): string {
  return JSON.stringify([
    assessment.schemaType,
    assessment.format,
    assessment.block ?? -1,
    assessment.path,
    assessment.status,
    assessment.observedProperties,
    assessment.missingRequiredProperties,
    assessment.limitations,
    assessment.documentationUrl,
  ])
}

/**
 * Bounds stored assessment detail without letting successful examples displace
 * missing-required-property evidence. Full status counts remain available when
 * even the failure set is larger than the detail limit.
 */
export function selectGoogleRichResultAssessments(
  assessments: GoogleRichResultAssessment[],
  limit = GOOGLE_RICH_RESULT_ASSESSMENT_LIMIT,
): {
  assessments: GoogleRichResultAssessment[]
  selection: GoogleRichResultAssessmentSelection
} {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error(
      'Google rich-result assessment limit must be a whole number.',
    )
  }

  const ordered = [...assessments].sort((left, right) => {
    const leftPriority = left.status === 'missing-required-properties' ? 0 : 1
    const rightPriority = right.status === 'missing-required-properties' ? 0 : 1
    return (
      leftPriority - rightPriority ||
      compareCodepoints(assessmentSortKey(left), assessmentSortKey(right))
    )
  })
  const returned = ordered.slice(0, limit)
  const eligibleByStatus = statusCounts(ordered)
  const returnedByStatus = statusCounts(returned)
  const omittedByStatus = emptyStatusCounts()
  for (const status of ASSESSMENT_STATUSES) {
    omittedByStatus[status] =
      eligibleByStatus[status] - returnedByStatus[status]
  }

  return {
    assessments: returned,
    selection: {
      limit,
      eligible: ordered.length,
      returned: returned.length,
      omitted: ordered.length - returned.length,
      partial: returned.length < ordered.length,
      eligibleByStatus,
      returnedByStatus,
      omittedByStatus,
    },
  }
}
